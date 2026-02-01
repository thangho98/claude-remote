// WebSocket Events: Client → Server
export type WSClientEvent =
  | { type: "auth"; token: string }
  | { type: "message"; content: string }
  | { type: "project:switch"; path: string }
  | { type: "file:read"; path: string }
  | { type: "file:list"; path: string }
  | { type: "session:list" }
  | { type: "session:switch"; sessionId: string }
  | { type: "session:new" }
  | { type: "session:resume"; sessionId: string }
  | { type: "commands:list" };

// WebSocket Events: Server → Client
export type WSServerEvent =
  | { type: "auth:success"; user: { authenticated: boolean } }
  | { type: "auth:error"; message: string }
  | { type: "message:chunk"; content: string; id: string }
  | { type: "message:done"; id: string }
  | { type: "message:error"; error: string; id: string }
  | { type: "message:thinking"; isThinking: boolean }
  | { type: "terminal:output"; content: string }
  | { type: "file:content"; path: string; content: string }
  | { type: "file:tree"; path: string; tree: FileNode }
  | { type: "project:list"; projects: Project[] }
  | { type: "project:current"; project: Project }
  | { type: "session:list"; sessions: Session[] }
  | { type: "session:current"; session: Session | null }
  | { type: "session:info"; model: string; usage: TokenUsage }
  | { type: "session:messages"; messages: Message[] }
  | { type: "commands:list"; commands: SlashCommand[] };

// Domain Types
export interface Project {
  id: string;
  name: string;
  path: string;
  lastAccessed?: string;
}

// Content block types for Claude messages
export interface TextBlock {
  type: "text";
  text: string;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}

export interface ImageBlock {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | unknown[];
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ThinkingBlock | ImageBlock | ToolUseBlock | ToolResultBlock;

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string | ContentBlock[];
  timestamp: string;
  isStreaming?: boolean;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export interface Session {
  id: string;
  title: string; // Summary from Claude Code, or firstPrompt as fallback
  firstPrompt: string;
  lastMessage?: string;
  messageCount: number;
  created: string;
  modified: string;
  model?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
}

export interface AppState {
  authenticated: boolean;
  currentProject: Project | null;
  projects: Project[];
  messages: Message[];
  files: FileNode | null;
  terminalOutput: string[];
  isConnected: boolean;
  isLoading: boolean;
  sessions: Session[];
  currentSession: Session | null;
  currentModel: string | null;
  tokenUsage: TokenUsage | null;
}

export interface SlashCommand {
  name: string;
  description: string;
  source: "builtin" | "project" | "user";
}
