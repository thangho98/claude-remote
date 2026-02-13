import { readFile, stat } from "fs/promises";
import { join } from "path";
import { readdir } from "fs/promises";

const HOME_DIR = process.env.HOME || null;
const CLAUDE_DIR = HOME_DIR ? join(HOME_DIR, ".claude") : null;
const CLAUDE_JSON_PATH = HOME_DIR ? join(HOME_DIR, ".claude.json") : null;

// Types for Claude config
export interface MCPServer {
  type?: "http" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
}

export interface ClaudeSettings {
  includeCoAuthoredBy?: boolean;
  permissions?: {
    allow?: string[];
  };
  hooks?: Record<string, unknown>;
  enabledPlugins?: Record<string, unknown>;
  mcpServers?: Record<string, MCPServer>;
  skipDangerousModePermissionPrompt?: boolean;
}

export interface ClaudeProjectInfo {
  id: string;
  name: string;
  path: string;
  sessionCount: number;
  lastModified: string;
  folderModifiedAt?: string;  // Folder mtime from filesystem
  lastCost?: number;
  lastDuration?: number;
  lastSessionId?: string;
  mcpServers?: Record<string, MCPServer>;
  enabledMcpjsonServers?: string[];
  disabledMcpjsonServers?: string[];
  allowedTools?: string[];
  ignorePatterns?: string[];
  hasTrustDialogAccepted?: boolean;
}

export interface ClaudeGlobalConfig {
  numStartups?: number;
  installMethod?: string;
  autoUpdates?: boolean;
  userID?: string;
  firstStartTime?: string;
  oauthAccount?: {
    emailAddress?: string;
    displayName?: string;
    billingType?: string;
    hasExtraUsageEnabled?: boolean;
  };
  mcpServers?: Record<string, MCPServer>;
  githubRepoPaths?: Record<string, string[]>;
  skillUsage?: Record<string, { usageCount: number; lastUsedAt: number }>;
}

export interface ClaudeConfig {
  global: ClaudeGlobalConfig;
  settings: ClaudeSettings;
  projects: ClaudeProjectInfo[];
  claudeDir: string;
}

interface SessionEntry {
  sessionId: string;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: string;
  modified: string;
  projectPath: string;
}

interface SessionsIndex {
  version: number;
  entries: SessionEntry[];
  originalPath: string;
}

interface ClaudeJsonProject {
  allowedTools?: string[];
  mcpContextUris?: string[];
  mcpServers?: Record<string, MCPServer>;
  enabledMcpjsonServers?: string[];
  disabledMcpjsonServers?: string[];
  hasTrustDialogAccepted?: boolean;
  ignorePatterns?: string[];
  projectOnboardingSeenCount?: number;
  exampleFiles?: string[];
  lastCost?: number;
  lastDuration?: number;
  lastSessionId?: string;
}

/**
 * Load global Claude config from ~/.claude.json
 */
export async function loadClaudeGlobalConfig(): Promise<ClaudeGlobalConfig> {
  if (!CLAUDE_JSON_PATH) {
    return {};
  }

  try {
    const content = await readFile(CLAUDE_JSON_PATH, "utf-8");
    return JSON.parse(content) as ClaudeGlobalConfig;
  } catch {
    return {};
  }
}

/**
 * Load Claude settings from ~/.claude/settings.json
 */
export async function loadClaudeSettings(): Promise<ClaudeSettings> {
  if (!CLAUDE_DIR) {
    return {};
  }

  try {
    const settingsPath = join(CLAUDE_DIR, "settings.json");
    const content = await readFile(settingsPath, "utf-8");
    return JSON.parse(content) as ClaudeSettings;
  } catch {
    return {};
  }
}

/**
 * Load all projects from ~/.claude.json (projects field) and ~/.claude/projects/
 * Sorted by lastModified from sessions-index.json (latest first)
 */
export async function loadClaudeProjects(): Promise<ClaudeProjectInfo[]> {
  const projects: ClaudeProjectInfo[] = [];

  // First, load global config to get project metadata from .claude.json
  const globalConfig = await loadClaudeGlobalConfig();
  const claudeJsonProjects = globalConfig.projects || {};

  if (!CLAUDE_DIR) {
    return projects;
  }

  const projectsDir = join(CLAUDE_DIR, "projects");

  try {
    const entries = await readdir(projectsDir);

    for (const entry of entries) {
      // Skip hidden files and DS_Store
      if (entry.startsWith(".") || entry === "DS_Store") {
        continue;
      }

      const projectPath = join(projectsDir, entry);
      const indexPath = join(projectPath, "sessions-index.json");

      try {
        const indexContent = await readFile(indexPath, "utf-8");
        const indexData: SessionsIndex = JSON.parse(indexContent);

        if (!indexData.originalPath) {
          continue;
        }

        // Get all files in project folder and find the latest modified
        let latestModified = new Date(0);
        try {
          const projectFiles = await readdir(projectPath);
          for (const file of projectFiles) {
            if (file.startsWith(".")) continue;
            const filePath = join(projectPath, file);
            try {
              const fileStats = await stat(filePath);
              if (fileStats.mtime > latestModified) {
                latestModified = fileStats.mtime;
              }
            } catch {
              // Skip files we can't stat
            }
          }
        } catch {
          // Fallback to sessions-index.json mtime if readdir fails
        }

        // If no files found or readdir failed, use sessions-index.json mtime
        if (latestModified.getTime() === 0) {
          const indexStats = await stat(indexPath);
          latestModified = indexStats.mtime;
        }

        const lastModified = latestModified.toISOString();

        // Get additional project info from .claude.json
        const projectMeta: ClaudeJsonProject = claudeJsonProjects[indexData.originalPath] || {};

        projects.push({
          id: Buffer.from(indexData.originalPath).toString("base64"),
          name: entry,
          path: indexData.originalPath,
          sessionCount: indexData.entries.length,
          lastModified,
          lastCost: projectMeta.lastCost,
          lastDuration: projectMeta.lastDuration,
          lastSessionId: projectMeta.lastSessionId,
          mcpServers: projectMeta.mcpServers,
          enabledMcpjsonServers: projectMeta.enabledMcpjsonServers,
          disabledMcpjsonServers: projectMeta.disabledMcpjsonServers,
          allowedTools: projectMeta.allowedTools,
          ignorePatterns: projectMeta.ignorePatterns,
          hasTrustDialogAccepted: projectMeta.hasTrustDialogAccepted,
        });
      } catch {
        // Skip projects with invalid sessions-index.json
      }
    }
  } catch {
    // Projects directory doesn't exist
  }

  // Sort by lastModified from sessions-index.json (most recent first)
  projects.sort((a, b) => {
    return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
  });

  return projects;
}

/**
 * Load complete Claude config (global + settings + projects)
 */
export async function loadClaudeConfig(): Promise<ClaudeConfig | null> {
  if (!CLAUDE_DIR || !CLAUDE_JSON_PATH) {
    return null;
  }

  const [global, settings, projects] = await Promise.all([
    loadClaudeGlobalConfig(),
    loadClaudeSettings(),
    loadClaudeProjects(),
  ]);

  return {
    global,
    settings,
    projects,
    claudeDir: CLAUDE_DIR,
  };
}

/**
 * Get MCP servers list for display (from global config)
 */
export function getGlobalMCPServers(global: ClaudeGlobalConfig): Array<{ name: string; type?: string; url?: string; command?: string; args?: string[] }> {
  if (!global.mcpServers) {
    return [];
  }

  return Object.entries(global.mcpServers).map(([name, server]) => ({
    name,
    type: server.type,
    url: server.url,
    command: server.command,
    args: server.args,
  }));
}

/**
 * Get MCP servers list for display (from settings)
 */
export function getMCPServersList(settings: ClaudeSettings): Array<{ name: string; type?: string; url?: string; command?: string }> {
  if (!settings.mcpServers) {
    return [];
  }

  return Object.entries(settings.mcpServers).map(([name, server]) => ({
    name,
    type: server.type,
    url: server.url,
    command: server.command,
  }));
}

/**
 * Get enabled hooks list
 */
export function getHooksList(settings: ClaudeSettings): string[] {
  if (!settings.hooks) {
    return [];
  }

  return Object.keys(settings.hooks);
}

/**
 * Get allowed permissions list
 */
export function getAllowedPermissions(settings: ClaudeSettings): string[] {
  return settings.permissions?.allow || [];
}

/**
 * Get user info from global config
 */
export function getUserInfo(global: ClaudeGlobalConfig): {
  userID?: string;
  email?: string;
  displayName?: string;
  billingType?: string;
  hasExtraUsageEnabled?: boolean;
  firstStartTime?: string;
  numStartups?: number;
} {
  return {
    userID: global.userID,
    email: global.oauthAccount?.emailAddress,
    displayName: global.oauthAccount?.displayName,
    billingType: global.oauthAccount?.billingType,
    hasExtraUsageEnabled: global.oauthAccount?.hasExtraUsageEnabled,
    firstStartTime: global.firstStartTime,
    numStartups: global.numStartups,
  };
}

/**
 * Get skill usage stats from global config
 */
export function getSkillUsage(global: ClaudeGlobalConfig): Array<{
  name: string;
  usageCount: number;
  lastUsedAt: Date;
}> {
  if (!global.skillUsage) {
    return [];
  }

  return Object.entries(global.skillUsage)
    .map(([name, stats]) => ({
      name,
      usageCount: stats.usageCount,
      lastUsedAt: new Date(stats.lastUsedAt),
    }))
    .sort((a, b) => b.usageCount - a.usageCount);
}

/**
 * Get GitHub repo paths from global config
 */
export function getGitHubRepoPaths(global: ClaudeGlobalConfig): Record<string, string[]> {
  return global.githubRepoPaths || {};
}
