import { readdir, readFile, stat, unlink, rm } from "fs/promises";
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
  // Claude CLI replaces both / and _ with -
  return projectPath.replace(/[/_]/g, "-");
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

  // Build a map of sessions from index
  const indexMap = new Map<string, SessionIndexEntry>();
  try {
    const indexPath = join(claudeFolderPath, "sessions-index.json");
    const indexContent = await readFile(indexPath, "utf-8");
    const indexData: SessionsIndex = JSON.parse(indexContent);
    if (indexData.entries) {
      for (const entry of indexData.entries) {
        indexMap.set(entry.sessionId, entry);
      }
    }
  } catch {
    // Index doesn't exist or is invalid - continue with folder scan
  }

  // Scan folder for .jsonl files to find sessions not in index
  const allSessionIds = new Set<string>(indexMap.keys());
  try {
    const files = await readdir(claudeFolderPath);
    for (const file of files) {
      // Match UUID pattern session files, skip agent-*.jsonl
      if (file.endsWith(".jsonl") && !file.startsWith("agent-")) {
        const sessionId = file.replace(".jsonl", "");
        allSessionIds.add(sessionId);
      }
    }
  } catch {
    // Folder doesn't exist - return empty
    return [];
  }

  if (allSessionIds.size === 0) {
    return [];
  }

  // Build session list from both index and discovered files
  const sessions = await Promise.all(
    Array.from(allSessionIds).map(async (sessionId) => {
      const indexEntry = indexMap.get(sessionId);

      // Check if .jsonl file exists on disk
      let fileExists = false;
      let fileBirth: string | null = null;
      let fileMod: string | null = null;
      try {
        const fileStat = await stat(join(claudeFolderPath, `${sessionId}.jsonl`));
        fileExists = true;
        fileBirth = fileStat.birthtime.toISOString();
        fileMod = fileStat.mtime.toISOString();
      } catch {
        // File doesn't exist on disk
      }

      // Skip sessions that have no .jsonl AND no index entry
      if (!fileExists && !indexEntry) {
        return null;
      }

      const { firstPrompt: extractedFirst, lastMessage } = fileExists
        ? await getFirstAndLastMessage(claudeFolderPath, sessionId)
        : { firstPrompt: undefined, lastMessage: undefined };

      // Get timestamps
      let created: string;
      let modified: string;
      let messageCount = 0;

      if (fileExists) {
        created = fileBirth!;
        modified = fileMod!;
        messageCount = indexEntry?.messageCount || 0;
      } else if (indexEntry) {
        // File deleted but index has metadata — show as historical
        created = indexEntry.created;
        modified = indexEntry.modified;
        messageCount = indexEntry.messageCount || 0;
      } else {
        return null;
      }

      // Use extracted first prompt if index has bad value
      const indexPrompt = indexEntry?.firstPrompt;
      const hasGoodIndexPrompt = indexPrompt &&
        indexPrompt.toLowerCase() !== "no prompt" &&
        indexPrompt !== "New session" &&
        indexPrompt.trim().length > 0;

      const firstPrompt = hasGoodIndexPrompt ? indexPrompt : (extractedFirst || "New session");

      // Use summary as title, fallback to firstPrompt
      const title = indexEntry?.summary && indexEntry.summary.trim().length > 0
        ? indexEntry.summary
        : firstPrompt;

      return {
        id: sessionId,
        title,
        firstPrompt,
        lastMessage,
        messageCount,
        created,
        modified,
      };
    })
  );

  // Filter out nulls and sort by modified date (most recent first)
  return sessions
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => {
      const dateA = new Date(a.modified || a.created).getTime();
      const dateB = new Date(b.modified || b.created).getTime();
      return dateB - dateA;
    });
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
    // ENOENT is expected when session file was deleted - return null silently
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
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
    // ENOENT is expected when session file was deleted - return empty silently
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    console.warn(`Failed to read session messages ${sessionId}:`, error);
    return [];
  }
}

export async function deleteSession(projectPath: string, sessionId: string): Promise<boolean> {
  if (!CLAUDE_PROJECTS_DIR) return false;

  const claudeFolderName = getClaudeFolderName(projectPath);
  const claudeFolderPath = join(CLAUDE_PROJECTS_DIR, claudeFolderName);

  try {
    // Delete .jsonl file
    const sessionFile = join(claudeFolderPath, `${sessionId}.jsonl`);
    await unlink(sessionFile).catch(() => {});

    // Delete session folder (subagents, tool-results, etc.)
    const sessionDir = join(claudeFolderPath, sessionId);
    await rm(sessionDir, { recursive: true, force: true }).catch(() => {});

    console.log(`🗑️ Deleted session ${sessionId}`);
    return true;
  } catch {
    return false;
  }
}
