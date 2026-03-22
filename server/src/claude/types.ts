/**
 * Chat provider interface
 * Defines the contract for supported agent backends (Claude/Codex via SDK/CLI)
 */

export type ChatProviderType = 'claude' | 'codex';
export type ProviderInterfaceType = 'sdk' | 'cli';

export interface ProviderSelection {
  provider: ChatProviderType;
  interface: ProviderInterfaceType;
}

export interface ClaudeMessageHandler {
  onChunk: (content: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
  onToolUse?: (tool: string, input: string) => void;
  onToolResult?: (tool: string, result: string) => void;
  onThinking?: (isThinking: boolean) => void;
  onThinkingContent?: (content: string) => void;
  onSessionId?: (sessionId: string) => void;
  // Full message objects (for consistency with session history)
  onMessage?: (message: any) => void;
  // Tool permission callback (SDK only)
  onToolPermission?: (toolName: string, input: Record<string, unknown>, toolUseId: string) => Promise<{ allowed: boolean }>;
  // Called when models/account info become available (piggyback on first query)
  onModelsLoaded?: (models: { value: string; displayName: string; description: string }[]) => void;
  onAccountInfoLoaded?: (info: { email?: string; subscriptionType?: string; apiProvider?: string }) => void;
}

export interface ClaudeQueryOptions {
  prompt: string;
  workingDirectory: string;
  sessionId?: string | null;
  model?: string;
  settingsProfile?: string; // Path to settings file (e.g. ~/.claude/settings/alibaba.json)
  effortLevel?: string; // Claude: low | medium | high | max
  reasoningLevel?: string; // Codex: low | medium | high | xhigh
  speedLevel?: string; // Codex: standard | fast
  handlers: ClaudeMessageHandler;
}

export interface ClaudeProvider {
  /**
   * Provider name for logging/debugging
   */
  readonly name: string;
  readonly provider: ChatProviderType;
  readonly interface: ProviderInterfaceType;

  /**
   * Send a message to Claude and stream the response
   */
  query(options: ClaudeQueryOptions): Promise<void>;

  /**
   * Check if the provider is available/configured
   */
  isAvailable(): Promise<boolean>;
}
