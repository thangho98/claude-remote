import { spawn, type Subprocess } from "bun";

export interface ClaudeMessageHandler {
  onChunk: (content: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
  onToolUse?: (tool: string, input: string) => void;
}

/**
 * Send a message to Claude using the CLI in print mode
 * This approach uses the installed Claude CLI which has all the necessary authentication
 */
export async function sendToClaude(
  prompt: string,
  workingDirectory: string,
  handlers: ClaudeMessageHandler,
  sessionId?: string | null
): Promise<void> {
  return new Promise((resolve) => {
    let fullContent = "";
    let hasError = false;
    let hasStreamedContent = false; // Track if we've sent streaming content

    // Build command args
    const cmdArgs = [
      "claude",
      "-p", // print mode (non-interactive)
      prompt,
      "--output-format",
      "stream-json",
      "--verbose", // Required for stream-json in print mode
    ];

    // If we have a session ID, resume that session
    if (sessionId) {
      cmdArgs.push("--resume", sessionId);
    }

    // Use claude CLI with print mode and JSON output
    const proc = spawn({
      cmd: cmdArgs,
      cwd: workingDirectory,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        // Ensure we use the user's config
        HOME: process.env.HOME,
      },
    });

    // Handle stdout (streaming JSON)
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    async function processStream() {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete JSON lines
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const event = JSON.parse(line);
              const hadContent = handleStreamEvent(event, handlers, (content) => {
                fullContent += content;
              }, hasStreamedContent);
              if (hadContent) hasStreamedContent = true;
            } catch {
              // Not JSON, treat as plain text
              handlers.onChunk(line + "\n");
              fullContent += line + "\n";
              hasStreamedContent = true;
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer);
            handleStreamEvent(event, handlers, (content) => {
              fullContent += content;
            }, hasStreamedContent);
          } catch {
            handlers.onChunk(buffer);
          }
        }
      } catch (error) {
        console.error("Stream processing error:", error);
      }
    }

    // Handle stderr
    const stderrReader = proc.stderr.getReader();
    async function processStderr() {
      try {
        while (true) {
          const { done, value } = await stderrReader.read();
          if (done) break;

          const text = decoder.decode(value);
          console.error("Claude stderr:", text);

          if (
            text.includes("error") ||
            text.includes("Error") ||
            text.includes("failed")
          ) {
            hasError = true;
            handlers.onError(text);
          }
        }
      } catch (error) {
        console.error("Stderr processing error:", error);
      }
    }

    // Process both streams
    Promise.all([processStream(), processStderr()]).then(async () => {
      const exitCode = await proc.exited;

      if (exitCode !== 0 && !hasError) {
        handlers.onError(`Claude exited with code ${exitCode}`);
      }

      handlers.onDone();
      resolve();
    });
  });
}

function handleStreamEvent(
  event: unknown,
  handlers: ClaudeMessageHandler,
  appendContent: (content: string) => void,
  hasStreamedContent: boolean
): boolean {
  if (!event || typeof event !== "object") return false;

  const e = event as Record<string, unknown>;
  let sentContent = false;

  // Handle different event types from Claude CLI stream-json output
  if (e.type === "assistant" && e.message) {
    const msg = e.message as Record<string, unknown>;
    if (msg.content && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block && typeof block === "object") {
          const b = block as Record<string, unknown>;
          if (b.type === "text" && typeof b.text === "string") {
            handlers.onChunk(b.text);
            appendContent(b.text);
            sentContent = true;
          } else if (b.type === "tool_use") {
            const toolName = b.name as string;
            const toolInput = JSON.stringify(b.input, null, 2);
            handlers.onToolUse?.(toolName, toolInput);
          }
        }
      }
    }
  } else if (e.type === "content_block_delta") {
    const delta = e.delta as Record<string, unknown> | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      handlers.onChunk(delta.text);
      appendContent(delta.text);
      sentContent = true;
    }
  } else if (e.type === "result" && typeof e.result === "string") {
    // Final result - only send if we haven't streamed content yet
    if (!hasStreamedContent && e.result && !e.result.startsWith("{")) {
      handlers.onChunk(e.result);
      appendContent(e.result);
      sentContent = true;
    }
  }

  return sentContent;
}

/**
 * Alternative: Use Claude Agent SDK directly
 * Uncomment and install @anthropic-ai/claude-agent-sdk when available
 */
/*
import { query, ClaudeAgentOptions } from "@anthropic-ai/claude-agent-sdk";

export async function sendToClaudeSDK(
  prompt: string,
  workingDirectory: string,
  handlers: ClaudeMessageHandler
): Promise<void> {
  try {
    const options: ClaudeAgentOptions = {
      allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
      workingDirectory,
    };

    for await (const message of query({ prompt, options })) {
      if ("content" in message && typeof message.content === "string") {
        handlers.onChunk(message.content);
      }

      if ("toolUse" in message) {
        handlers.onToolUse?.(
          message.toolUse.name,
          JSON.stringify(message.toolUse.input)
        );
      }

      if ("result" in message) {
        handlers.onDone();
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    handlers.onError(errorMessage);
  }
}
*/
