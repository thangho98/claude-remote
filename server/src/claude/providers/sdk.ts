import type { ClaudeProvider, ClaudeQueryOptions } from '../types';

/**
 * Claude SDK Provider
 * Uses @anthropic-ai/claude-agent-sdk query function
 * Supports cwd and session resume
 */
export class ClaudeSdkProvider implements ClaudeProvider {
  readonly name = 'sdk';

  async isAvailable(): Promise<boolean> {
    try {
      const sdk = await import('@anthropic-ai/claude-agent-sdk');
      return typeof sdk.query === 'function';
    } catch {
      console.warn('@anthropic-ai/claude-agent-sdk not installed');
      return false;
    }
  }

  async query(options: ClaudeQueryOptions): Promise<void> {
    const { prompt, workingDirectory, sessionId, handlers } = options;

    try {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      handlers.onThinking?.(true);

      // Query options with cwd and session support
      const queryOptions: Record<string, unknown> = {
        cwd: workingDirectory,
        model: 'claude-sonnet-4-5-20250929',
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      };

      // Resume session if provided
      if (sessionId) {
        queryOptions.resume = sessionId;
        console.log(`🔄 SDK: Resuming session ${sessionId} in ${workingDirectory}`);
      } else {
        console.log(`🔄 SDK: Creating new session in ${workingDirectory}`);
      }

      // Execute query and stream results
      console.log('🔄 SDK: Starting query stream...');
      let messageCount = 0;

      for await (const msg of query({ prompt, options: queryOptions })) {
        messageCount++;
        const msgType = (msg as Record<string, unknown>).type;
        const msgSubtype = (msg as Record<string, unknown>).subtype;
        console.log(`🔄 SDK new message received: ${JSON.stringify(msg)}`);
        console.log(`🔄 SDK: Message #${messageCount} type=${msgType} subtype=${msgSubtype}`);

        // Capture session ID from system init message
        if (this.isSystemMessage(msg)) {
          if (msg.subtype === 'init' && msg.session_id) {
            console.log(`📋 SDK Session ID: ${msg.session_id}`);
            handlers.onSessionId?.(msg.session_id);
          }
        } else if (this.isAssistantMessage(msg)) {
          // Handle content blocks from assistant messages
          const content = msg.message?.content || msg.content;

          if (content && Array.isArray(content)) {
            for (const block of content) {
              if (this.isTextBlock(block)) {
                handlers.onThinking?.(false);
                console.log(`🔄 SDK: Text: "${block.text.slice(0, 50)}..."`);
                handlers.onChunk(block.text);
              } else if (this.isToolUseBlock(block)) {
                handlers.onThinking?.(false);
                console.log(`🔄 SDK: Tool use: ${block.name}`);
                handlers.onToolUse?.(block.name, JSON.stringify(block.input, null, 2));
              } else if (this.isThinkingBlock(block)) {
                console.log(`🔄 SDK: Thinking block`);
                handlers.onThinking?.(true);
              }
            }
          }
        } else if (this.isContentBlockDelta(msg)) {
          // Streaming content deltas
          const delta = (msg as { delta?: { type: string; text?: string } }).delta;
          if (delta?.type === 'text_delta' && delta.text) {
            handlers.onThinking?.(false);
            handlers.onChunk(delta.text);
          } else if (delta?.type === 'thinking_delta') {
            handlers.onThinking?.(true);
          }
        } else if (this.isResultMessage(msg)) {
          handlers.onThinking?.(false);
          console.log(`🔄 SDK: Result message subtype=${msg.subtype}`);
          // Result message contains final text - but we already sent it via assistant messages
          // Only log for debugging, don't send duplicate
        }
      }

      console.log(`🔄 SDK: Stream ended after ${messageCount} messages`);
      handlers.onThinking?.(false);
      handlers.onDone();
      console.log('🔄 SDK: onDone() called');
    } catch (error) {
      handlers.onThinking?.(false);
      const errorMessage = error instanceof Error ? error.message : 'Unknown SDK error';
      handlers.onError(errorMessage);
      console.error('SDK query error:', error);
    }
  }

  // Type guards
  private isSystemMessage(msg: unknown): msg is { type: 'system'; subtype: string; session_id?: string } {
    return typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>).type === 'system';
  }

  private isAssistantMessage(msg: unknown): msg is {
    type: 'assistant';
    content?: unknown[];
    message?: { content: unknown[] };
  } {
    return typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>).type === 'assistant';
  }

  private isContentBlockDelta(
    msg: unknown,
  ): msg is { type: 'content_block_delta'; delta: { type: string; text?: string } } {
    return (
      typeof msg === 'object' &&
      msg !== null &&
      (msg as Record<string, unknown>).type === 'content_block_delta'
    );
  }

  private isResultMessage(msg: unknown): msg is { type: 'result'; subtype: string; result?: string } {
    return typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>).type === 'result';
  }

  private isTextBlock(block: unknown): block is { type: 'text'; text: string } {
    return typeof block === 'object' && block !== null && (block as Record<string, unknown>).type === 'text';
  }

  private isThinkingBlock(block: unknown): block is { type: 'thinking' } {
    return (
      typeof block === 'object' && block !== null && (block as Record<string, unknown>).type === 'thinking'
    );
  }

  private isToolUseBlock(block: unknown): block is { type: 'tool_use'; name: string; input: unknown } {
    return (
      typeof block === 'object' && block !== null && (block as Record<string, unknown>).type === 'tool_use'
    );
  }
}
