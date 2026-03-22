import type { ClaudeProvider, ClaudeQueryOptions } from '../types';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';

interface ActiveSession {
  query: AsyncGenerator;
  abortController: AbortController;
  sessionId: string;
  settingsProfile?: string;
}

/**
 * Claude SDK Provider
 * Supports multiple concurrent sessions, each with its own query instance.
 */
export class ClaudeSdkProvider implements ClaudeProvider {
  readonly name = 'sdk';

  // Per-session active queries (sessionId → ActiveSession)
  private activeSessions = new Map<string, ActiveSession>();
  private currentPermissionMode: PermissionMode = 'bypassPermissions';

  // Accumulated usage from last completed result
  private lastResult: { totalCostUsd: number; usage: Record<string, unknown>; modelUsage: Record<string, unknown> } | null = null;

  // Rate limit / quota info from SDK events
  private rateLimits: Map<string, { resetsAt?: number; status: string }> = new Map();
  // Account info cached
  private accountInfoCache: { email?: string; subscriptionType?: string; apiProvider?: string } | null = null;
  // Models cached
  private modelsCache: { value: string; displayName: string; description: string }[] | null = null;
  private currentModelId: string | null = null;

  async isAvailable(): Promise<boolean> {
    try {
      const sdk = await import('@anthropic-ai/claude-agent-sdk');
      return typeof sdk.query === 'function';
    } catch {
      console.warn('@anthropic-ai/claude-agent-sdk not installed');
      return false;
    }
  }

  /**
   * Abort a specific session's query, or all if no sessionId given
   */
  abort(sessionId?: string): void {
    if (sessionId) {
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.abortController.abort();
        this.activeSessions.delete(sessionId);
        console.log(`🛑 Aborted session ${sessionId}`);
      }
    } else {
      // Abort all
      for (const [id, session] of this.activeSessions) {
        session.abortController.abort();
        console.log(`🛑 Aborted session ${id}`);
      }
      this.activeSessions.clear();
    }
  }

  /**
   * Check if a session has an active running query
   */
  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Get count of active sessions
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  setPermissionMode(mode: PermissionMode): void {
    this.currentPermissionMode = mode;
    console.log(`🔒 SDK permission mode set to: ${mode}`);
  }

  getPermissionMode(): PermissionMode {
    return this.currentPermissionMode;
  }

  getLastResult() {
    return this.lastResult;
  }

  getRateLimits() {
    return Object.fromEntries(this.rateLimits);
  }

  getAccountInfo() {
    return this.accountInfoCache;
  }

  getModels() {
    return this.modelsCache;
  }

  /**
   * Get cached models (populated on first real user query via piggyback).
   */
  getCachedModels(): { value: string; displayName: string; description: string }[] {
    return this.modelsCache || [];
  }

  getCurrentModelId() {
    return this.currentModelId;
  }

  async query(options: ClaudeQueryOptions): Promise<void> {
    const { prompt, workingDirectory, sessionId, handlers } = options;

    // Generate a tracking key — use sessionId if resuming, else a temp ID
    const trackingKey = sessionId || `new_${Date.now()}`;

    try {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      const abortController = new AbortController();

      handlers.onThinking?.(true);

      const resolvedModel = options.model || undefined;
      const queryOptions: Record<string, unknown> = {
        cwd: workingDirectory,
        ...(resolvedModel ? { model: resolvedModel } : {}),
        permissionMode: this.currentPermissionMode,
        abortController,
        settingSources: ['project', 'user', 'local'],
      };

      // Apply settings profile if specified
      if (options.settingsProfile) {
        queryOptions.settings = options.settingsProfile;
        console.log(`⚙️ Using settings profile: ${options.settingsProfile}`);
      }

      if (this.currentPermissionMode === 'bypassPermissions') {
        queryOptions.allowDangerouslySkipPermissions = true;
      }

      // Wire canUseTool callback for non-bypass modes
      if (this.currentPermissionMode !== 'bypassPermissions' && handlers.onToolPermission) {
        queryOptions.canUseTool = async (
          toolName: string,
          input: Record<string, unknown>,
          opts: { signal: AbortSignal; toolUseID: string; decisionReason?: string },
        ) => {
          const result = await handlers.onToolPermission!(toolName, input, opts.toolUseID);
          if (result.allowed) {
            return { behavior: 'allow' as const, toolUseID: opts.toolUseID };
          }
          return { behavior: 'deny' as const, message: 'User denied permission', toolUseID: opts.toolUseID };
        };
      }

      // Resume or create session
      if (sessionId) {
        queryOptions.resume = sessionId;
        console.log(`🔄 SDK: Resuming session ${sessionId}`);
      } else {
        console.log(`🔄 SDK: New session in ${workingDirectory}`);
      }

      const queryInstance = query({ prompt, options: queryOptions });

      // Track this session
      this.activeSessions.set(trackingKey, {
        query: queryInstance,
        abortController,
        sessionId: trackingKey,
        settingsProfile: options.settingsProfile,
      });

      // Piggyback: fetch account info + models on first query (non-blocking)
      if (!this.accountInfoCache || !this.modelsCache) {
        Promise.all([
          (queryInstance as any).accountInfo().catch(() => null),
          (queryInstance as any).supportedModels().catch(() => null),
        ]).then(([info, models]) => {
          if (info) {
            this.accountInfoCache = info;
            handlers.onAccountInfoLoaded?.(info);
          }
          if (models) {
            this.modelsCache = models;
            handlers.onModelsLoaded?.(models);
          }
        });
      }

      let messageCount = 0;
      let realSessionId = sessionId;

      for await (const msg of queryInstance) {
        messageCount++;
        const e = msg as Record<string, unknown>;

        if (e.type === 'system' && e.subtype === 'init' && e.session_id) {
          if (e.model) this.currentModelId = e.model as string;
          realSessionId = e.session_id as string;
          handlers.onSessionId?.(realSessionId);

          // Re-key tracking if this was a new session
          if (trackingKey !== realSessionId) {
            const active = this.activeSessions.get(trackingKey);
            if (active) {
              this.activeSessions.delete(trackingKey);
              active.sessionId = realSessionId;
              this.activeSessions.set(realSessionId, active);
            }
          }
        } else if (e.type === 'assistant' && e.message) {
          const rawMsg = e.message as Record<string, unknown>;
          if (rawMsg.id) {
            handlers.onMessage?.({
              id: rawMsg.id,
              role: 'assistant',
              content: rawMsg.content,
              timestamp: new Date().toISOString(),
            });
          }
        } else if (e.type === 'content_block_delta') {
          const delta = e.delta as Record<string, unknown> | undefined;
          if (delta?.type === 'text_delta' && delta.text) {
            handlers.onThinking?.(false);
            handlers.onChunk(delta.text as string);
          } else if (delta?.type === 'thinking_delta' && delta.thinking) {
            handlers.onThinking?.(true);
            handlers.onThinkingContent?.(delta.thinking as string);
          }
        } else if (e.type === 'user' && e.message) {
          const rawMsg = e.message as Record<string, unknown>;
          handlers.onMessage?.({
            id: `msg_${Date.now()}`,
            role: 'user',
            content: (rawMsg as Record<string, unknown>).content,
            timestamp: new Date().toISOString(),
          });
          const content = (rawMsg as Record<string, unknown>).content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block && typeof block === 'object' && (block as Record<string, unknown>).type === 'tool_result') {
                const b = block as Record<string, unknown>;
                handlers.onToolResult?.(b.tool_use_id as string, (b.content as string) || '');
              }
            }
          }
        } else if (e.type === 'rate_limit_event') {
          const info = e.rate_limit_info as Record<string, unknown>;
          const rateType = (info.rateLimitType as string) || 'session';
          this.rateLimits.set(rateType, {
            resetsAt: info.resetsAt as number | undefined,
            status: (info.status as string) || 'unknown',
          });
        } else if (e.type === 'result' && e.subtype === 'success') {
          this.lastResult = {
            totalCostUsd: (e.total_cost_usd as number) || 0,
            usage: (e.usage as Record<string, unknown>) || {},
            modelUsage: (e.modelUsage as Record<string, unknown>) || {},
          };
        }
      }

      console.log(`🔄 SDK: Session ${realSessionId || trackingKey} completed after ${messageCount} messages (${this.activeSessions.size - 1} other active sessions)`);
      this.activeSessions.delete(realSessionId || trackingKey);
      handlers.onThinking?.(false);
      handlers.onDone();
    } catch (error) {
      this.activeSessions.delete(trackingKey);
      handlers.onThinking?.(false);

      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`🔄 SDK: Session ${trackingKey} aborted`);
        handlers.onDone();
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown SDK error';
      handlers.onError(errorMessage);
      console.error('SDK query error:', error);
    }
  }
}
