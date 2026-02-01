import { readdir, readFile } from "fs/promises";
import { join } from "path";
import type { Session, TokenUsage, ContentBlock } from "../../../shared/types";

const CLAUDE_PROJECTS_DIR = process.env.HOME
  ? join(process.env.HOME, ".claude", "projects")
  : null;

interface SessionIndexEntry {
  sessionId: string;
  firstPrompt: string;
  summary?: string;
  messageCount: number;
  created: string;
  modified: string;
}

interface SessionsIndex {
  originalPath?: string;
  entries?: SessionIndexEntry[];
}

interface MessageUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface SessionMessage {
  message?: {
    model?: string;
    usage?: MessageUsage;
  };
}

function getClaudeFolderName(projectPath: string): string {
  // Convert path like /Users/thawng/Desktop/source/AI/claude-remote
  // to folder name like -Users-thawng-Desktop-source-AI-claude-remote
  return projectPath.replace(/\//g, "-").replace(/^-/, "-");
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    // Extract text from content blocks
    for (const block of content) {
      if (typeof block === "object" && block !== null) {
        const b = block as { type?: string; text?: string };
        if (b.type === "text" && b.text) {
          return b.text;
        }
      }
    }
  }
  return "";
}

async function getFirstAndLastMessage(
  claudeFolderPath: string,
  sessionId: string
): Promise<{ firstPrompt?: string; lastMessage?: string }> {
  try {
    const sessionPath = join(claudeFolderPath, `${sessionId}.jsonl`);
    const content = await readFile(sessionPath, "utf-8");
    const lines = content.trim().split("\n");

    let firstPrompt: string | undefined;
    let lastMessage: string | undefined;

    // Find first user message
    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.type === "user" && data.message?.content) {
          const msg = extractTextFromContent(data.message.content);
          if (msg) {
            firstPrompt = msg.length > 80 ? msg.slice(0, 80) + "..." : msg;
            break;
          }
        }
      } catch {
        // Skip invalid lines
      }
    }

    // Find last user message (from the end)
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const data = JSON.parse(lines[i]);
        if (data.type === "user" && data.message?.content) {
          const msg = extractTextFromContent(data.message.content);
          if (msg) {
            lastMessage = msg.length > 50 ? msg.slice(0, 50) + "..." : msg;
            break;
          }
        }
      } catch {
        // Skip invalid lines
      }
    }

    return { firstPrompt, lastMessage };
  } catch {
    // Session file not found or unreadable
  }
  return {};
}

export async function listSessions(projectPath: string): Promise<Session[]> {
  if (!CLAUDE_PROJECTS_DIR) {
    console.warn("HOME not set, cannot read Claude projects");
    return [];
  }

  const claudeFolderName = getClaudeFolderName(projectPath);
  const claudeFolderPath = join(CLAUDE_PROJECTS_DIR, claudeFolderName);

  try {
    const indexPath = join(claudeFolderPath, "sessions-index.json");
    const indexContent = await readFile(indexPath, "utf-8");
    const indexData: SessionsIndex = JSON.parse(indexContent);

    if (!indexData.entries || indexData.entries.length === 0) {
      return [];
    }

    // Sort by modified date, most recent first
    const sortedEntries = [...indexData.entries].sort((a, b) => {
      const dateA = new Date(a.modified || a.created).getTime();
      const dateB = new Date(b.modified || b.created).getTime();
      return dateB - dateA;
    });

    // Get first and last message for each session (parallel)
    const sessions = await Promise.all(
      sortedEntries.map(async (entry) => {
        const { firstPrompt: extractedFirst, lastMessage } = await getFirstAndLastMessage(
          claudeFolderPath,
          entry.sessionId
        );

        // Use extracted first prompt if index has bad value
        const indexPrompt = entry.firstPrompt;
        const hasGoodIndexPrompt = indexPrompt &&
          indexPrompt.toLowerCase() !== "no prompt" &&
          indexPrompt !== "New session" &&
          indexPrompt.trim().length > 0;

        const firstPrompt = hasGoodIndexPrompt ? indexPrompt : (extractedFirst || "New session");

        // Use summary as title, fallback to firstPrompt
        const title = entry.summary && entry.summary.trim().length > 0
          ? entry.summary
          : firstPrompt;

        return {
          id: entry.sessionId,
          title,
          firstPrompt,
          lastMessage,
          messageCount: entry.messageCount || 0,
          created: entry.created,
          modified: entry.modified,
        };
      })
    );

    return sessions;
  } catch (error) {
    console.warn(`Failed to read sessions for ${projectPath}:`, error);
    return [];
  }
}

export async function getSessionInfo(
  projectPath: string,
  sessionId: string
): Promise<{ model: string; usage: TokenUsage } | null> {
  if (!CLAUDE_PROJECTS_DIR) {
    return null;
  }

  const claudeFolderName = getClaudeFolderName(projectPath);
  const claudeFolderPath = join(CLAUDE_PROJECTS_DIR, claudeFolderName);
  const sessionPath = join(claudeFolderPath, `${sessionId}.jsonl`);

  try {
    const content = await readFile(sessionPath, "utf-8");
    const lines = content.trim().split("\n");

    let model = "unknown";
    let totalOutputTokens = 0;

    // Track the LAST message's usage for current context
    let lastInputTokens = 0;
    let lastCacheCreation = 0;
    let lastCacheRead = 0;

    for (const line of lines) {
      try {
        const data: SessionMessage = JSON.parse(line);
        if (data.message?.model) {
          model = data.message.model;
        }
        if (data.message?.usage) {
          const usage = data.message.usage;
          // Sum output tokens across all messages
          totalOutputTokens += usage.output_tokens || 0;
          // Keep only the last message's input context
          lastInputTokens = usage.input_tokens || 0;
          lastCacheCreation = usage.cache_creation_input_tokens || 0;
          lastCacheRead = usage.cache_read_input_tokens || 0;
        }
      } catch {
        // Skip invalid lines
      }
    }

    // Current context = input + cache tokens from LAST message
    // Cache already includes previous conversation history (both user and assistant messages)
    const currentContext = lastInputTokens + lastCacheCreation + lastCacheRead;

    return {
      model,
      usage: {
        inputTokens: lastInputTokens,
        outputTokens: totalOutputTokens,
        cacheCreationTokens: lastCacheCreation,
        cacheReadTokens: lastCacheRead,
        // totalTokens now represents the current context window usage
        totalTokens: currentContext,
      },
    };
  } catch (error) {
    console.warn(`Failed to read session ${sessionId}:`, error);
    return null;
  }
}

export async function getSessionMessages(
  projectPath: string,
  sessionId: string
): Promise<Array<{ role: string; content: string | ContentBlock[]; timestamp: string }>> {
  if (!CLAUDE_PROJECTS_DIR) {
    return [];
  }

  const claudeFolderName = getClaudeFolderName(projectPath);
  const claudeFolderPath = join(CLAUDE_PROJECTS_DIR, claudeFolderName);
  const sessionPath = join(claudeFolderPath, `${sessionId}.jsonl`);

  try {
    const content = await readFile(sessionPath, "utf-8");
    const lines = content.trim().split("\n");
    const messages: Array<{ role: string; content: string | ContentBlock[]; timestamp: string }> = [];

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.type === "user" && data.message?.content) {
          // Preserve original content format (string or array)
          messages.push({
            role: "user",
            content: data.message.content,
            timestamp: data.timestamp,
          });
        } else if (data.type === "assistant" && data.message?.content) {
          // Preserve original content format (array with text/tool_use blocks)
          messages.push({
            role: "assistant",
            content: data.message.content,
            timestamp: data.timestamp,
          });
        }
      } catch {
        // Skip invalid lines
      }
    }

    return messages;
  } catch (error) {
    console.warn(`Failed to read session messages ${sessionId}:`, error);
    return [];
  }
}
