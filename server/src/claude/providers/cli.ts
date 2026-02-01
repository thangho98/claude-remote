import { spawn } from "bun";
import type { ClaudeProvider, ClaudeQueryOptions, ClaudeMessageHandler } from "../types";

/**
 * Claude CLI Provider
 * Uses the installed Claude CLI with print mode and stream-json output
 */
export class ClaudeCliProvider implements ClaudeProvider {
  readonly name = "cli";

  async isAvailable(): Promise<boolean> {
    try {
      const proc = spawn({
        cmd: ["claude", "--version"],
        stdout: "pipe",
        stderr: "pipe",
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

      const cmdArgs = [
        "claude",
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
      ];

      handlers.onThinking?.(true);

      if (sessionId) {
        cmdArgs.push("--resume", sessionId);
      }

      const proc = spawn({
        cmd: cmdArgs,
        cwd: workingDirectory,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          HOME: process.env.HOME,
        },
      });

      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim()) continue;

              try {
                const event = JSON.parse(line);
                const hadContent = this.handleStreamEvent(event, handlers, hasStreamedContent);
                if (hadContent) hasStreamedContent = true;
              } catch {
                handlers.onChunk(line + "\n");
                hasStreamedContent = true;
              }
            }
          }

          if (buffer.trim()) {
            try {
              const event = JSON.parse(buffer);
              this.handleStreamEvent(event, handlers, hasStreamedContent);
            } catch {
              handlers.onChunk(buffer);
            }
          }
        } catch (error) {
          console.error("Stream processing error:", error);
        }
      };

      const stderrReader = proc.stderr.getReader();
      const processStderr = async () => {
        try {
          while (true) {
            const { done, value } = await stderrReader.read();
            if (done) break;

            const text = decoder.decode(value);
            console.error("Claude stderr:", text);

            if (text.includes("error") || text.includes("Error") || text.includes("failed")) {
              hasError = true;
              handlers.onError(text);
            }
          }
        } catch (error) {
          console.error("Stderr processing error:", error);
        }
      };

      Promise.all([processStream(), processStderr()]).then(async () => {
        const exitCode = await proc.exited;
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
    hasStreamedContent: boolean
  ): boolean {
    if (!event || typeof event !== "object") return false;

    const e = event as Record<string, unknown>;
    let sentContent = false;

    if (e.type === "assistant" && e.message) {
      const msg = e.message as Record<string, unknown>;
      if (msg.content && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block && typeof block === "object") {
            const b = block as Record<string, unknown>;
            if (b.type === "thinking") {
              handlers.onThinking?.(true);
            } else if (b.type === "text" && typeof b.text === "string") {
              handlers.onThinking?.(false);
              handlers.onChunk(b.text);
              sentContent = true;
            } else if (b.type === "tool_use") {
              handlers.onThinking?.(false);
              const toolName = b.name as string;
              const toolInput = JSON.stringify(b.input, null, 2);
              handlers.onToolUse?.(toolName, toolInput);
            }
          }
        }
      }
    } else if (e.type === "content_block_start") {
      const contentBlock = e.content_block as Record<string, unknown> | undefined;
      if (contentBlock?.type === "thinking") {
        handlers.onThinking?.(true);
      }
    } else if (e.type === "content_block_delta") {
      const delta = e.delta as Record<string, unknown> | undefined;
      if (delta?.type === "thinking_delta") {
        handlers.onThinking?.(true);
      } else if (delta?.type === "text_delta" && typeof delta.text === "string") {
        handlers.onThinking?.(false);
        handlers.onChunk(delta.text);
        sentContent = true;
      }
    } else if (e.type === "result" && typeof e.result === "string") {
      handlers.onThinking?.(false);
      if (!hasStreamedContent && e.result && !e.result.startsWith("{")) {
        handlers.onChunk(e.result);
        sentContent = true;
      }
    }

    return sentContent;
  }
}
