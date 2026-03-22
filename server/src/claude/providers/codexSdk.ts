import { spawn } from 'bun';
import type { ClaudeProvider, ClaudeQueryOptions } from '../types';

interface CodexRunResult {
  finalResponse?: string;
  final_response?: string;
  threadId?: string;
  thread_id?: string;
}

/**
 * Codex SDK provider.
 * The SDK wraps the same local Codex agent, but gives us a cleaner thread API
 * than shelling out to `codex exec` directly.
 */
export class CodexSdkProvider implements ClaudeProvider {
  readonly name = 'codex-sdk';
  readonly provider = 'codex' as const;
  readonly interface = 'sdk' as const;

  async isAvailable(): Promise<boolean> {
    try {
      const [sdkModule, versionProc] = await Promise.all([
        import('@openai/codex-sdk'),
        Promise.resolve(
          spawn({
            cmd: ['codex', '--version'],
            stdout: 'ignore',
            stderr: 'ignore',
          }),
        ),
      ]);

      const exitCode = await versionProc.exited;
      return typeof sdkModule.Codex === 'function' && exitCode === 0;
    } catch {
      return false;
    }
  }

  async query(options: ClaudeQueryOptions): Promise<void> {
    const { prompt, workingDirectory, sessionId, handlers } = options;

    try {
      const { Codex } = await import('@openai/codex-sdk');

      handlers.onThinking?.(true);

      const model = options.model || process.env.CODEX_MODEL;
      const codex = new Codex();

      const threadOptions: Record<string, unknown> = {
        ...(model ? { model } : {}),
        workingDirectory,
        skipGitRepoCheck: true,
      };

      if (options.reasoningLevel) {
        threadOptions.reasoningEffort = options.reasoningLevel;
      }

      const thread = sessionId
        ? codex.resumeThread(sessionId, threadOptions)
        : codex.startThread(threadOptions);

      if (thread.id) {
        handlers.onSessionId?.(thread.id);
      }

      if (options.settingsProfile) {
        console.log(`⚠️ Codex SDK ignores settings profile "${options.settingsProfile}"`);
      }

      const result = (await thread.run(prompt)) as CodexRunResult;
      const resolvedSessionId = thread.id || result.threadId || result.thread_id;
      const finalResponse = result.finalResponse || result.final_response || '';

      if (resolvedSessionId) {
        handlers.onSessionId?.(resolvedSessionId);
      }

      if (finalResponse.trim()) {
        handlers.onChunk(finalResponse.trim());
      }

      handlers.onThinking?.(false);
      handlers.onDone();
    } catch (error) {
      handlers.onThinking?.(false);
      const message = error instanceof Error ? error.message : 'Unknown Codex SDK error';
      handlers.onError(message);
      console.error('Codex SDK query error:', error);
    }
  }
}
