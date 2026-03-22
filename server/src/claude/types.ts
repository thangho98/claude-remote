/**
 * Claude Provider Interface
 * Defines the contract for different Claude implementations (CLI, SDK)
 */

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

export type ClaudeProviderType = 'cli' | 'sdk';
