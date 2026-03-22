import { readFile, readdir } from "fs/promises";
import { join, basename } from "path";
import {
  loadClaudeSettings,
  loadClaudeGlobalConfig,
  type MCPServer,
  type ClaudeSettings,
} from "./claudeConfig";
import { getCurrentProviderType, ClaudeSdkProvider } from "../claude/providers";
import { getClaudeProvider } from "../claude/providers";
import { getAccountInfoFromCredentials } from "./usage";

/**
 * Read ~/.claude/settings.json and return it as a generic record.
 */
export async function getClaudeConfig(): Promise<Record<string, unknown>> {
  const settings = await loadClaudeSettings();
  return settings as unknown as Record<string, unknown>;
}

interface McpServerInfo {
  name: string;
  type: string;
  status: string;
}

/**
 * Read MCP server configs from global (~/.claude.json) and optionally
 * project-level (<projectPath>/.claude.json) configs.
 * Returns a merged list with { name, type, status: 'configured' }.
 */
export async function getMcpServers(projectPath?: string): Promise<McpServerInfo[]> {
  const servers: McpServerInfo[] = [];
  const seen = new Set<string>();

  // 1. Global MCP servers from ~/.claude.json
  const globalConfig = await loadClaudeGlobalConfig();
  if (globalConfig.mcpServers) {
    for (const [name, server] of Object.entries(globalConfig.mcpServers)) {
      seen.add(name);
      servers.push({
        name,
        type: inferServerType(server),
        status: "configured",
      });
    }
  }

  // 2. Settings-level MCP servers from ~/.claude/settings.json
  const settings = await loadClaudeSettings();
  if (settings.mcpServers) {
    for (const [name, server] of Object.entries(settings.mcpServers)) {
      if (!seen.has(name)) {
        seen.add(name);
        servers.push({
          name,
          type: inferServerType(server),
          status: "configured",
        });
      }
    }
  }

  // 3. Project-level MCP servers from <project>/.claude.json
  if (projectPath) {
    try {
      const projectConfigPath = join(projectPath, ".claude.json");
      const content = await readFile(projectConfigPath, "utf-8");
      const projectConfig = JSON.parse(content);
      const projectServers: Record<string, MCPServer> | undefined = projectConfig.mcpServers;
      if (projectServers) {
        for (const [name, server] of Object.entries(projectServers)) {
          if (!seen.has(name)) {
            seen.add(name);
            servers.push({
              name,
              type: inferServerType(server),
              status: "configured",
            });
          }
        }
      }
    } catch {
      // No project-level .claude.json or invalid JSON — skip
    }
  }

  return servers;
}

/**
 * Scan ~/.claude/settings/ for settings profile files.
 * Returns list of { name, path, description } for each .json file found.
 */
export async function listSettingsProfiles(): Promise<{ name: string; path: string; model?: string; provider?: string }[]> {
  const settingsDir = join(process.env.HOME || '', '.claude', 'settings');
  const profiles: { name: string; path: string; model?: string; provider?: string }[] = [];

  // Always include "Default" (no custom settings file)
  profiles.push({ name: 'Default', path: '', provider: 'Anthropic' });

  try {
    const files = await readdir(settingsDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = join(settingsDir, file);
      try {
        const content = JSON.parse(await readFile(filePath, 'utf-8'));
        const name = basename(file, '.json');
        // Try to extract a readable description from env vars
        const model = content.env?.ANTHROPIC_MODEL || undefined;
        const baseUrl = content.env?.ANTHROPIC_BASE_URL || '';
        let provider = 'Custom';
        if (baseUrl.includes('dashscope')) provider = 'Alibaba/DashScope';
        else if (baseUrl.includes('openai')) provider = 'OpenAI';
        else if (baseUrl.includes('bedrock')) provider = 'AWS Bedrock';
        else if (baseUrl.includes('vertex')) provider = 'Google Vertex';
        else if (baseUrl.includes('azure')) provider = 'Azure';
        else if (model) provider = model;

        profiles.push({ name, path: filePath, model, provider });
      } catch {
        // Skip invalid JSON files
      }
    }
  } catch {
    // ~/.claude/settings/ doesn't exist — just return Default
  }

  return profiles;
}

/**
 * Return current provider type, permission mode, and model.
 */
export async function getProviderInfo(workingDirectory?: string): Promise<{
  provider: string;
  permissionMode: string;
  model: string;
  models: { value: string; displayName: string; description: string }[];
  costInfo: { totalCostUsd: number; usage: Record<string, unknown>; modelUsage: Record<string, unknown> } | null;
  rateLimits: Record<string, { resetsAt?: number; status: string }>;
  accountInfo: { email?: string; subscriptionType?: string; apiProvider?: string } | null;
}> {
  // Ensure provider is initialized
  let providerType = getCurrentProviderType();
  if (!providerType) {
    try {
      const provider = await getClaudeProvider();
      providerType = provider.name as 'cli' | 'sdk';
    } catch {
      providerType = 'unknown' as any;
    }
  }

  let permissionMode = "unknown";
  let model = "default";
  let models: { value: string; displayName: string; description: string }[] = [];

  if (providerType === "sdk") {
    try {
      const provider = await getClaudeProvider();
      if (provider instanceof ClaudeSdkProvider) {
        permissionMode = provider.getPermissionMode();
        model = provider.getCurrentModelId() || "default";
        // Models are loaded via piggyback on first user query — just return cache
        models = provider.getModels() || [];
      }
    } catch { /* ignore */ }
  } else if (providerType === "cli") {
    permissionMode = "cli-default";
  }

  // Get usage/cost and rate limits from SDK
  let costInfo: { totalCostUsd: number; usage: Record<string, unknown>; modelUsage: Record<string, unknown> } | null = null;
  let rateLimits: Record<string, { utilization: number; resetsAt?: number; status: string }> = {};
  if (providerType === 'sdk') {
    try {
      const provider = await getClaudeProvider();
      if (provider instanceof ClaudeSdkProvider) {
        costInfo = provider.getLastResult();
        rateLimits = provider.getRateLimits();
      }
    } catch { /* ignore */ }
  }

  // Get account info: try SDK cache first, fallback to keychain credentials
  let accountInfo: { email?: string; subscriptionType?: string; apiProvider?: string } | null = null;
  if (providerType === 'sdk') {
    try {
      const provider = await getClaudeProvider();
      if (provider instanceof ClaudeSdkProvider) {
        accountInfo = provider.getAccountInfo();
      }
    } catch { /* ignore */ }
  }
  if (!accountInfo) {
    accountInfo = getAccountInfoFromCredentials();
  }

  return { provider: providerType || 'unknown', permissionMode, model, models, costInfo, rateLimits, accountInfo };
}

function inferServerType(server: MCPServer): string {
  if (server.type) return server.type;
  if (server.url) return "http";
  if (server.command) return "stdio";
  return "unknown";
}
