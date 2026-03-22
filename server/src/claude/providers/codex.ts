import { spawn } from 'bun';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ClaudeProvider, ClaudeQueryOptions } from '../types';

type CodexEvent =
  | { type: 'thread.started'; thread_id?: string }
  | { type: 'turn.started' }
  | { type: 'turn.failed'; error?: { message?: string } }
  | { type: 'error'; message?: string }
  | {
      type: 'event_msg';
      payload?: {
        type?: string;
        message?: string;
        phase?: string;
        last_agent_message?: string;
      };
    }
  | {
      type: 'response_item';
      payload?: {
        type?: string;
        role?: string;
        phase?: string;
        content?: Array<{ type?: string; text?: string }>;
      };
    };

/**
 * Codex CLI provider.
 * Uses `codex exec --json` for non-interactive agent runs and maps the final
 * message back into the existing websocket message protocol.
 */
export class CodexCliProvider implements ClaudeProvider {
  readonly name = 'codex-cli';
  readonly provider = 'codex' as const;
  readonly interface = 'cli' as const;

  async isAvailable(): Promise<boolean> {
    try {
      const proc = spawn({
        cmd: ['codex', '--version'],
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
      let finalMessage = '';
      const outputFile = join(tmpdir(), `claude-remote-codex-${Date.now()}-${crypto.randomUUID()}.txt`);

      const cmdArgs = sessionId
        ? [
            'codex',
            'exec',
            'resume',
            '--json',
            '--skip-git-repo-check',
            '--full-auto',
            '--color',
            'never',
            '-o',
            outputFile,
            sessionId,
            prompt,
          ]
        : [
            'codex',
            'exec',
            '--json',
            '--skip-git-repo-check',
            '--full-auto',
            '--color',
            'never',
            '-o',
            outputFile,
            prompt,
          ];

      const model = options.model || process.env.CODEX_MODEL;
      if (model) {
        cmdArgs.splice(sessionId ? 4 : 3, 0, '-m', model);
      }

      // Wire reasoning effort level
      if (options.reasoningLevel) {
        const insertPos = sessionId ? 4 : 3;
        cmdArgs.splice(insertPos, 0, '--reasoning-effort', options.reasoningLevel);
      }

      const profile = options.settingsProfile;
      if (profile) {
        cmdArgs.splice(sessionId ? 4 : 3, 0, '-p', profile);
      }

      handlers.onThinking?.(true);

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

      const decoder = new TextDecoder();
      const stdoutReader = proc.stdout.getReader();
      const stderrReader = proc.stderr.getReader();
      let stdoutBuffer = '';

      const consumeStdout = async () => {
        while (true) {
          const { done, value } = await stdoutReader.read();
          if (done) break;
          stdoutBuffer += decoder.decode(value, { stream: true });
          const lines = stdoutBuffer.split('\n');
          stdoutBuffer = lines.pop() || '';

          for (const line of lines) {
            this.handleStdoutLine(line, handlers, (message) => {
              if (message) finalMessage = message;
            });
          }
        }

        if (stdoutBuffer.trim()) {
          this.handleStdoutLine(stdoutBuffer, handlers, (message) => {
            if (message) finalMessage = message;
          });
        }
      };

      const consumeStderr = async () => {
        while (true) {
          const { done, value } = await stderrReader.read();
          if (done) break;
          const text = decoder.decode(value);
          if (text.includes('ERROR') || text.includes('error')) {
            hasError = true;
          }
        }
      };

      Promise.all([consumeStdout(), consumeStderr()]).then(async () => {
        const exitCode = await proc.exited;
        let outputContent = finalMessage;

        try {
          const fileContent = await readFile(outputFile, 'utf-8');
          if (fileContent.trim()) {
            outputContent = fileContent.trim();
          }
        } catch {
          // Ignore: fallback to captured JSON events
        }

        try {
          await unlink(outputFile);
        } catch {
          // Ignore cleanup failures
        }

        if (outputContent) {
          handlers.onChunk(outputContent);
        }

        handlers.onThinking?.(false);

        if (exitCode !== 0 && !hasError) {
          handlers.onError(`Codex exited with code ${exitCode}`);
        }

        handlers.onDone();
        resolve();
      });
    });
  }

  private handleStdoutLine(
    line: string,
    handlers: ClaudeQueryOptions['handlers'],
    setFinalMessage: (message: string) => void,
  ) {
    const trimmed = line.trim();
    if (!trimmed) return;

    let event: CodexEvent | null = null;
    try {
      event = JSON.parse(trimmed) as CodexEvent;
    } catch {
      return;
    }

    if (event.type === 'thread.started' && event.thread_id) {
      handlers.onSessionId?.(event.thread_id);
      return;
    }

    if (event.type === 'turn.started') {
      handlers.onThinking?.(true);
      return;
    }

    if (event.type === 'turn.failed') {
      const message = event.error?.message || 'Codex turn failed';
      handlers.onError(message);
      return;
    }

    if (event.type === 'error') {
      const message = event.message || '';
      if (!message.startsWith('Reconnecting...')) {
        handlers.onError(message || 'Codex error');
      }
      return;
    }

    if (event.type === 'event_msg') {
      if (event.payload?.type === 'agent_message' && event.payload.message) {
        handlers.onThinkingContent?.(event.payload.message);
      }
      if (event.payload?.type === 'task_complete' && event.payload.last_agent_message) {
        setFinalMessage(event.payload.last_agent_message);
      }
      return;
    }

    if (
      event.type === 'response_item' &&
      event.payload?.type === 'message' &&
      event.payload.role === 'assistant'
    ) {
      const text = (event.payload.content || [])
        .filter((item) => item?.type === 'output_text' && item.text)
        .map((item) => item.text)
        .join('\n')
        .trim();

      if (text && event.payload.phase === 'final_answer') {
        setFinalMessage(text);
      }
    }
  }
}
