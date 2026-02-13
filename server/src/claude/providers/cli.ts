import { spawn } from 'bun';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClaudeProvider, ClaudeQueryOptions, ClaudeMessageHandler } from '../types';

/**
 * Claude CLI Provider
 * Uses the installed Claude CLI with print mode and stream-json output
 */
export class ClaudeCliProvider implements ClaudeProvider {
  readonly name = 'cli';

  async isAvailable(): Promise<boolean> {
    try {
      const proc = spawn({
        cmd: ['claude', '--version'],
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const exitCode = await proc.exited;
      return exitCode === 0;
    } catch {
      return false;
    }
  }

  async query(options: ClaudeQueryOptions): Promise<void> {
    const { prompt, workingDirectory, sessionId, handlers } = options;

    return new Promise((resolve) => {
      let hasError = false;
      let hasStreamedContent = false;
      const debugMessages: unknown[] = [];

      const cmdArgs = [
        'claude',
        '-p',
        prompt,
        '--output-format',
        'stream-json',
        '--verbose',
        '--dangerously-skip-permissions',
      ];

      // Add model flag if specified
      const model = options.model || process.env.CLAUDE_MODEL;
      if (model) {
        cmdArgs.push('--model', model);
      }

      handlers.onThinking?.(true);

      if (sessionId) {
        cmdArgs.push('--resume', sessionId);
      }

      const proc = spawn({
        cmd: cmdArgs,
        cwd: workingDirectory,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          HOME: process.env.HOME,
        },
      });

      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;

              try {
                const event = JSON.parse(line);
                debugMessages.push(event);
                const hadContent = this.handleStreamEvent(event, handlers, hasStreamedContent);
                if (hadContent) hasStreamedContent = true;
              } catch {
                handlers.onChunk(line + '\n');
                hasStreamedContent = true;
              }
            }
          }

          if (buffer.trim()) {
            try {
              const event = JSON.parse(buffer);
              debugMessages.push(event);
              this.handleStreamEvent(event, handlers, hasStreamedContent);
            } catch {
              handlers.onChunk(buffer);
            }
          }
        } catch (error) {
          console.error('Stream processing error:', error);
        }
      };

      const stderrReader = proc.stderr.getReader();
      const processStderr = async () => {
        try {
          while (true) {
            const { done, value } = await stderrReader.read();
            if (done) break;

            const text = decoder.decode(value);
            console.error('Claude stderr:', text);

            if (text.includes('error') || text.includes('Error') || text.includes('failed')) {
              hasError = true;
              handlers.onError(text);
            }
          }
        } catch (error) {
          console.error('Stderr processing error:', error);
        }
      };

      Promise.all([processStream(), processStderr()]).then(async () => {
        const exitCode = await proc.exited;

        try {
          const debugFilePath = join(process.cwd(), 'debug_cli_messages.json');
          writeFileSync(debugFilePath, JSON.stringify(debugMessages, null, 2));
          console.log(`Debug CLI messages saved to ${debugFilePath}`);
        } catch (e) {
          console.error('Failed to save debug CLI messages:', e);
        }

        handlers.onThinking?.(false);

        if (exitCode !== 0 && !hasError) {
          handlers.onError(`Claude exited with code ${exitCode}`);
        }

        handlers.onDone();
        resolve();
      });
    });
  }

  private handleStreamEvent(
    event: unknown,
    handlers: ClaudeMessageHandler,
    hasStreamedContent: boolean,
  ): boolean {
    if (!event || typeof event !== 'object') return false;

    const e = event as Record<string, unknown>;
    let sentContent = false;

    if (e.type === 'system' && e.subtype === 'init' && e.session_id) {
      handlers.onSessionId?.(e.session_id as string);
      return true;
    }

    if (e.type === 'assistant' && e.message) {
      const msg = e.message as Record<string, unknown>;

      // Send full message update
      if (msg.id) {
        handlers.onMessage?.({
          id: msg.id,
          role: 'assistant',
          content: msg.content,
          timestamp: new Date().toISOString(),
        });
      }
      return true;
    }

    if (e.type === 'user' && e.message) {
      const msg = e.message as Record<string, unknown>;
      // Send full message update (Tool Result)
      handlers.onMessage?.({
        id: `msg_${Date.now()}`,
        role: 'user',
        content: msg.content,
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    // Still handle thinking deltas for real-time feedback if needed,
    // but text/tool content is now synced via onMessage
    if (e.type === 'content_block_delta') {
      const delta = e.delta as Record<string, unknown> | undefined;
      if (delta?.type === 'thinking_delta') {
        handlers.onThinking?.(true);
        // We could stream thinking content here if we want real-time thinking updates
        if (delta.thinking) {
          handlers.onThinkingContent?.(delta.thinking as string);
        }
      }
    }

    return sentContent;
  }
}
