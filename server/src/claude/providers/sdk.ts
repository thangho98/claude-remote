import type { ClaudeProvider, ClaudeQueryOptions } from "../types";

/**
 * Claude SDK Provider
 * Uses @anthropic-ai/claude-agent-sdk for direct API access
 */
export class ClaudeSdkProvider implements ClaudeProvider {
  readonly name = "sdk";

  async isAvailable(): Promise<boolean> {
    // Check if API key is configured
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn("ANTHROPIC_API_KEY not set, SDK provider unavailable");
      return false;
    }

    try {
      // Try to import the SDK
      await import("@anthropic-ai/claude-agent-sdk");
      return true;
    } catch {
      console.warn("@anthropic-ai/claude-agent-sdk not installed");
      return false;
    }
  }

  async query(options: ClaudeQueryOptions): Promise<void> {
    const { prompt, workingDirectory, sessionId, handlers } = options;

    try {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");

      handlers.onThinking?.(true);

      const queryOptions: Record<string, unknown> = {
        allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
        permissionMode: "bypassPermissions",
        cwd: workingDirectory,
      };

      // Resume session if provided
      if (sessionId) {
        queryOptions.resume = sessionId;
      }

      let currentSessionId: string | null = null;

      for await (const message of query({ prompt, options: queryOptions })) {
        // Handle different message types
        if (this.isSystemMessage(message)) {
          if (message.subtype === "init" && message.session_id) {
            currentSessionId = message.session_id;
            console.log(`📋 SDK Session ID: ${currentSessionId}`);
          }
        } else if (this.isAssistantMessage(message)) {
          handlers.onThinking?.(false);

          // Handle content blocks
          if (message.content && Array.isArray(message.content)) {
            for (const block of message.content) {
              if (this.isTextBlock(block)) {
                handlers.onChunk(block.text);
              } else if (this.isThinkingBlock(block)) {
                handlers.onThinking?.(true);
              } else if (this.isToolUseBlock(block)) {
                handlers.onToolUse?.(block.name, JSON.stringify(block.input, null, 2));
              }
            }
          }
        } else if (this.isContentBlockDelta(message)) {
          const delta = (message as { delta?: { type: string; text?: string } }).delta;
          if (delta?.type === "text_delta" && delta.text) {
            handlers.onThinking?.(false);
            handlers.onChunk(delta.text);
          } else if (delta?.type === "thinking_delta") {
            handlers.onThinking?.(true);
          }
        } else if (this.isResultMessage(message)) {
          handlers.onThinking?.(false);
          // Final result - could send if not already streamed
        }
      }

      handlers.onThinking?.(false);
      handlers.onDone();
    } catch (error) {
      handlers.onThinking?.(false);
      const errorMessage = error instanceof Error ? error.message : "Unknown SDK error";
      handlers.onError(errorMessage);
      console.error("SDK query error:", error);
    }
  }

  // Type guards for message types
  private isSystemMessage(msg: unknown): msg is { type: "system"; subtype: string; session_id?: string } {
    return typeof msg === "object" && msg !== null && (msg as Record<string, unknown>).type === "system";
  }

  private isAssistantMessage(msg: unknown): msg is { type: "assistant"; content: unknown[] } {
    return typeof msg === "object" && msg !== null && (msg as Record<string, unknown>).type === "assistant";
  }

  private isContentBlockDelta(msg: unknown): msg is { type: "content_block_delta"; delta: { type: string; text?: string } } {
    return typeof msg === "object" && msg !== null && (msg as Record<string, unknown>).type === "content_block_delta";
  }

  private isResultMessage(msg: unknown): msg is { result: string } {
    return typeof msg === "object" && msg !== null && "result" in (msg as Record<string, unknown>);
  }

  private isTextBlock(block: unknown): block is { type: "text"; text: string } {
    return typeof block === "object" && block !== null && (block as Record<string, unknown>).type === "text";
  }

  private isThinkingBlock(block: unknown): block is { type: "thinking" } {
    return typeof block === "object" && block !== null && (block as Record<string, unknown>).type === "thinking";
  }

  private isToolUseBlock(block: unknown): block is { type: "tool_use"; name: string; input: unknown } {
    return typeof block === "object" && block !== null && (block as Record<string, unknown>).type === "tool_use";
  }
}
