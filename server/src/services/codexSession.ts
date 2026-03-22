import { readFile, readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import type { ContentBlock, Session, TokenUsage } from '../../../shared/types';

const CODEX_DIR = process.env.HOME ? join(process.env.HOME, '.codex') : null;
const CODEX_SESSIONS_DIR = CODEX_DIR ? join(CODEX_DIR, 'sessions') : null;
const CODEX_SESSION_INDEX_PATH = CODEX_DIR ? join(CODEX_DIR, 'session_index.jsonl') : null;
const CODEX_MODELS_CACHE_PATH = CODEX_DIR ? join(CODEX_DIR, 'models_cache.json') : null;
const CODEX_CONFIG_PATH = CODEX_DIR ? join(CODEX_DIR, 'config.toml') : null;
const CODEX_AUTH_PATH = CODEX_DIR ? join(CODEX_DIR, 'auth.json') : null;

interface CodexIndexEntry {
  id: string;
  thread_name?: string;
  updated_at?: string;
}

interface CodexRolloutLine {
  timestamp?: string;
  type?: string;
  payload?: Record<string, any>;
}

interface CodexAuthFile {
  auth_mode?: string;
  OPENAI_API_KEY?: string;
  tokens?: {
    id_token?: string;
    access_token?: string;
    refresh_token?: string;
    account_id?: string;
  };
}

let rolloutPathCache = new Map<string, string>();
let rolloutPathCacheBuiltAt = 0;

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractSessionIdFromRolloutPath(filePath: string): string | null {
  const match = filePath.match(/-([0-9a-f-]{36})\.jsonl$/i);
  return match?.[1] || null;
}

async function buildRolloutPathCache(): Promise<Map<string, string>> {
  if (!CODEX_SESSIONS_DIR) return new Map();
  if (rolloutPathCacheBuiltAt && Date.now() - rolloutPathCacheBuiltAt < 30_000) {
    return rolloutPathCache;
  }

  const files = await walk(CODEX_SESSIONS_DIR).catch(() => []);
  const nextCache = new Map<string, string>();

  for (const file of files) {
    const sessionId = extractSessionIdFromRolloutPath(file);
    if (sessionId) {
      nextCache.set(sessionId, file);
    }
  }

  rolloutPathCache = nextCache;
  rolloutPathCacheBuiltAt = Date.now();
  return rolloutPathCache;
}

async function readJsonLines<T = CodexRolloutLine>(filePath: string): Promise<T[]> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as T;
        } catch {
          return null;
        }
      })
      .filter((line): line is T => line !== null);
  } catch {
    return [];
  }
}

async function readIndexEntries(): Promise<CodexIndexEntry[]> {
  if (!CODEX_SESSION_INDEX_PATH) return [];
  return readJsonLines<CodexIndexEntry>(CODEX_SESSION_INDEX_PATH);
}

async function readSessionMeta(filePath: string): Promise<CodexRolloutLine | null> {
  const lines = await readJsonLines<CodexRolloutLine>(filePath);
  return lines.find((line) => line.type === 'session_meta') || null;
}

function mapOutputText(content: Array<{ type?: string; text?: string }> = []): string {
  return content
    .filter((item) => item?.type === 'output_text' && item.text)
    .map((item) => item.text?.trim() || '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

function mapInputText(content: Array<{ type?: string; text?: string }> = []): string {
  return content
    .filter((item) => (item?.type === 'input_text' || item?.type === 'text') && item.text)
    .map((item) => item.text?.trim() || '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

function isEnvironmentContextMessage(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('<environment_context>') && trimmed.endsWith('</environment_context>');
}

function decodeJwtPayload(token?: string): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf-8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function formatPlanName(plan: string): string {
  switch (plan.toLowerCase()) {
    case 'free':
      return 'Free';
    case 'plus':
      return 'Plus';
    case 'pro':
      return 'Pro';
    case 'team':
      return 'Team';
    case 'edu':
      return 'Edu';
    case 'enterprise':
      return 'Enterprise';
    default:
      return plan
        .split(/[_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
}

export async function getCodexConfig(): Promise<Record<string, unknown>> {
  if (!CODEX_CONFIG_PATH) return {};
  try {
    const content = await readFile(CODEX_CONFIG_PATH, 'utf-8');
    return (Bun.TOML.parse(content) as Record<string, unknown>) || {};
  } catch {
    return {};
  }
}

export async function getCodexModels(): Promise<{ value: string; displayName: string; description: string }[]> {
  if (!CODEX_MODELS_CACHE_PATH) return [];
  try {
    const raw = JSON.parse(await readFile(CODEX_MODELS_CACHE_PATH, 'utf-8')) as {
      models?: Array<{ slug?: string; display_name?: string; description?: string; visibility?: string }>;
    };

    return (raw.models || [])
      .filter((model) => model.slug && model.visibility !== 'hidden')
      .map((model) => ({
        value: model.slug!,
        displayName: model.display_name || model.slug!,
        description: model.description || '',
      }));
  } catch {
    return [];
  }
}

export async function getCodexAccountInfo(): Promise<{
  email?: string;
  subscriptionType?: string;
  apiProvider?: string;
} | null> {
  if (!CODEX_AUTH_PATH) {
    if (process.env.OPENAI_API_KEY) {
      return { apiProvider: 'OpenAI API key' };
    }
    return null;
  }

  try {
    const raw = JSON.parse(await readFile(CODEX_AUTH_PATH, 'utf-8')) as CodexAuthFile;
    const jwtPayload = decodeJwtPayload(raw.tokens?.id_token);

    const email = typeof jwtPayload?.email === 'string' ? jwtPayload.email : undefined;
    const plan = typeof jwtPayload?.chatgpt_plan_type === 'string'
      ? formatPlanName(jwtPayload.chatgpt_plan_type)
      : undefined;

    const hasApiKey = Boolean(raw.OPENAI_API_KEY || process.env.OPENAI_API_KEY);
    let apiProvider: string | undefined;

    if (raw.auth_mode === 'apikey' || hasApiKey) {
      apiProvider = 'OpenAI API key';
    } else if (raw.auth_mode && raw.auth_mode !== 'chatgpt') {
      apiProvider = raw.auth_mode;
    } else if (raw.auth_mode === 'chatgpt' && !email && !plan) {
      apiProvider = 'ChatGPT';
    }

    if (email || plan || apiProvider) {
      return {
        ...(email ? { email } : {}),
        ...(plan ? { subscriptionType: plan } : {}),
        ...(apiProvider ? { apiProvider } : {}),
      };
    }
  } catch {
    if (process.env.OPENAI_API_KEY) {
      return { apiProvider: 'OpenAI API key' };
    }
  }
  return null;
}

export async function listCodexSessions(projectPath: string): Promise<Session[]> {
  const [indexEntries, pathCache] = await Promise.all([readIndexEntries(), buildRolloutPathCache()]);

  const sessions: Array<Session | null> = await Promise.all(
    indexEntries.map(async (entry) => {
      const filePath = pathCache.get(entry.id);
      if (!filePath) return null;

      const meta = await readSessionMeta(filePath);
      const cwd = meta?.payload?.cwd;
      if (cwd !== projectPath) return null;

      let modified = entry.updated_at || meta?.timestamp || new Date().toISOString();
      let created = meta?.payload?.timestamp || meta?.timestamp || modified;

      try {
        const stats = await stat(filePath);
        modified = entry.updated_at || stats.mtime.toISOString();
        created = meta?.payload?.timestamp || stats.birthtime.toISOString();
      } catch {
        // Ignore stat failures
      }

      return {
        id: entry.id,
        provider: 'codex' as const,
        title: entry.thread_name || 'Codex session',
        firstPrompt: entry.thread_name || 'Codex session',
        lastMessage: undefined,
        messageCount: 0,
        created,
        modified,
        model: (meta?.payload?.model as string | undefined) || undefined,
      };
    }),
  );

  return sessions
    .filter((session): session is Session => session !== null)
    .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
}

export async function getCodexSessionInfo(sessionId: string): Promise<{ model: string; usage: TokenUsage } | null> {
  const config = await getCodexConfig();
  const pathCache = await buildRolloutPathCache();
  const filePath = pathCache.get(sessionId);
  if (!filePath) return null;

  const lines = await readJsonLines<CodexRolloutLine>(filePath);
  const tokenLine = [...lines].reverse().find((line) => line.type === 'event_msg' && line.payload?.type === 'token_count');
  const turnContextLine = [...lines].reverse().find((line) => line.type === 'turn_context' && typeof line.payload?.model === 'string');
  const lastUsage = tokenLine?.payload?.info?.last_token_usage || {};

  return {
    model: (turnContextLine?.payload?.model as string | undefined) || (config.model as string | undefined) || 'default',
    usage: {
      inputTokens: lastUsage.input_tokens || 0,
      outputTokens: lastUsage.output_tokens || 0,
      cacheCreationTokens: 0,
      cacheReadTokens: lastUsage.cached_input_tokens || 0,
      totalTokens: lastUsage.total_tokens || 0,
    },
  };
}

export async function getCodexSessionMessages(
  sessionId: string,
): Promise<Array<{ role: string; content: string | ContentBlock[]; timestamp: string }>> {
  const pathCache = await buildRolloutPathCache();
  const filePath = pathCache.get(sessionId);
  if (!filePath) return [];

  const lines = await readJsonLines<CodexRolloutLine>(filePath);
  const messages: Array<{ role: string; content: string | ContentBlock[]; timestamp: string }> = [];

  for (const line of lines) {
    if (line.type !== 'response_item' || !line.payload) continue;

    if (line.payload.type === 'message' && line.payload.role === 'user') {
      const text = mapInputText(line.payload.content);
      if (!text || isEnvironmentContextMessage(text)) continue;

      messages.push({
        role: 'user',
        content: text,
        timestamp: line.timestamp || new Date().toISOString(),
      });
      continue;
    }

    if (line.payload.type === 'message' && line.payload.role === 'assistant') {
      const text = mapOutputText(line.payload.content);
      if (!text) continue;

      messages.push({
        role: 'assistant',
        content: text,
        timestamp: line.timestamp || new Date().toISOString(),
      });
    }
  }

  return messages;
}

export async function deleteCodexSession(sessionId: string): Promise<boolean> {
  const pathCache = await buildRolloutPathCache();
  const filePath = pathCache.get(sessionId);
  if (!filePath) return false;

  try {
    await unlink(filePath);
    pathCache.delete(sessionId);
    return true;
  } catch {
    return false;
  }
}
