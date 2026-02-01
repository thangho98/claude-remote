/**
 * Claude Provider Interface
 * Defines the contract for different Claude implementations (CLI, SDK)
 */

export interface ClaudeMessageHandler {
  onChunk: (content: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
  onToolUse?: (tool: string, input: string) => void;
  onThinking?: (isThinking: boolean) => void;
  onSessionId?: (sessionId: string) => void;
}

export interface ClaudeQueryOptions {
  prompt: string;
  workingDirectory: string;
  sessionId?: string | null;
  handlers: ClaudeMessageHandler;
}

export interface ClaudeProvider {
  /**
   * Provider name for logging/debugging
   */
  readonly name: string;

  /**
   * Send a message to Claude and stream the response
   */
  query(options: ClaudeQueryOptions): Promise<void>;

  /**
   * Check if the provider is available/configured
   */
  isAvailable(): Promise<boolean>;
}

export type ClaudeProviderType = "cli" | "sdk";
