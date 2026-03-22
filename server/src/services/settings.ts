import { readFile, readdir } from 'fs/promises';
import { basename, join } from 'path';
import type {
  ChatProvider,
  ProviderInterface,
  ProviderInterfaceOption,
  ProviderOption,
  ProviderSettingsSummary,
} from '../../../shared/types';
import {
  loadClaudeSettings,
  loadClaudeGlobalConfig,
  type MCPServer,
  type ClaudeSettings,
} from './claudeConfig';
import {
  ClaudeSdkProvider,
  INTERFACE_LABELS,
  PROVIDER_INTERFACE_LABELS,
  PROVIDER_LABELS,
  getProviderAvailability,
} from '../claude/providers';
import { getClaudeProvider } from '../claude/providers';
import type { ChatProviderType, ProviderInterfaceType, ProviderSelection } from '../claude/types';
import { getAccountInfoFromCredentials, fetchUsageQuota } from './usage';
import { getCodexAccountInfo, getCodexConfig, getCodexModels } from './codexSession';
import { getSessionInfo } from './session';
import { getCodexSessionInfo } from './codexSession';

interface McpServerInfo {
  name: string;
  type: string;
  status: string;
}

interface ProviderInfo {
  provider: ChatProviderType;
  interface: ProviderInterfaceType;
  permissionMode: string;
  model: string;
  models: { value: string; displayName: string; description: string }[];
  costInfo: { totalCostUsd: number; usage: Record<string, unknown>; modelUsage: Record<string, unknown> } | null;
  rateLimits: Record<string, { resetsAt?: number; status: string }>;
  accountInfo: { email?: string; subscriptionType?: string; apiProvider?: string } | null;
  interfaces: ProviderInterfaceOption[];
}

function normalizeModelEntry(name: string, config: Record<string, unknown>) {
  return {
    name,
    path: name,
    model: typeof config.model === 'string' ? config.model : undefined,
    provider: typeof config.model_provider === 'string' ? config.model_provider : 'Codex',
  };
}

function inferServerType(server: MCPServer | Record<string, unknown>): string {
  if ('type' in server && typeof server.type === 'string') return server.type;
  if ('url' in server && typeof server.url === 'string') return 'http';
  if ('command' in server && typeof server.command === 'string') return 'stdio';
  return 'unknown';
}

function getProviderOptions(
  availability: Record<ChatProviderType, Record<ProviderInterfaceType, boolean>>,
): ProviderOption[] {
  return (Object.keys(PROVIDER_LABELS) as ChatProviderType[]).map((provider) => ({
    value: provider,
    label: PROVIDER_LABELS[provider],
    available: Object.values(availability[provider]).some(Boolean),
  }));
}

function getInterfaceOptions(
  provider: ChatProviderType,
  availability: Record<ChatProviderType, Record<ProviderInterfaceType, boolean>>,
): ProviderInterfaceOption[] {
  return (Object.keys(INTERFACE_LABELS) as ProviderInterfaceType[]).map((value) => ({
    value,
    label: PROVIDER_INTERFACE_LABELS[provider][value],
    available: availability[provider][value],
  }));
}

/**
 * Read provider config and return it as a generic record.
 */
export async function getClaudeConfig(
  selection: ProviderSelection,
): Promise<Record<string, unknown>> {
  if (selection.provider === 'codex') {
    return getCodexConfig();
  }

  const settings = await loadClaudeSettings();
  return settings as unknown as Record<string, unknown>;
}

/**
 * Read MCP server configs for the selected provider.
 */
export async function getMcpServers(
  projectPath: string | undefined,
  selection: ProviderSelection,
): Promise<McpServerInfo[]> {
  if (selection.provider === 'codex') {
    const codexConfig = await getCodexConfig();
    const codexServers = codexConfig.mcp_servers;

    if (!codexServers || typeof codexServers !== 'object') {
      return [];
    }

    return Object.entries(codexServers as Record<string, Record<string, unknown>>).map(([name, server]) => ({
      name,
      type: inferServerType(server),
      status: server.enabled === false ? 'disabled' : 'configured',
    }));
  }

  const servers: McpServerInfo[] = [];
  const seen = new Set<string>();

  const globalConfig = await loadClaudeGlobalConfig();
  if (globalConfig.mcpServers) {
    for (const [name, server] of Object.entries(globalConfig.mcpServers)) {
      seen.add(name);
      servers.push({
        name,
        type: inferServerType(server),
        status: 'configured',
      });
    }
  }

  const settings = await loadClaudeSettings();
  if (settings.mcpServers) {
    for (const [name, server] of Object.entries(settings.mcpServers)) {
      if (!seen.has(name)) {
        seen.add(name);
        servers.push({
          name,
          type: inferServerType(server),
          status: 'configured',
        });
      }
    }
  }

  if (projectPath) {
    try {
      const projectConfigPath = join(projectPath, '.claude.json');
      const content = await readFile(projectConfigPath, 'utf-8');
      const projectConfig = JSON.parse(content);
      const projectServers: Record<string, MCPServer> | undefined = projectConfig.mcpServers;

      if (projectServers) {
        for (const [name, server] of Object.entries(projectServers)) {
          if (!seen.has(name)) {
            seen.add(name);
            servers.push({
              name,
              type: inferServerType(server),
              status: 'configured',
            });
          }
        }
      }
    } catch {
      // No project-level .claude.json or invalid JSON
    }
  }

  return servers;
}

/**
 * Scan provider settings profiles.
 */
export async function listSettingsProfiles(
  selection: ProviderSelection,
): Promise<{ name: string; path: string; model?: string; provider?: string }[]> {
  if (selection.provider === 'codex') {
    const profiles: { name: string; path: string; model?: string; provider?: string }[] = [
      { name: 'Default', path: '', provider: 'OpenAI' },
    ];

    if (selection.interface === 'sdk') {
      return profiles;
    }

    const codexConfig = await getCodexConfig();
    const rawProfiles = codexConfig.profiles;

    if (rawProfiles && typeof rawProfiles === 'object') {
      for (const [name, value] of Object.entries(rawProfiles as Record<string, Record<string, unknown>>)) {
        profiles.push(normalizeModelEntry(name, value));
      }
    }

    return profiles;
  }

  const settingsDir = join(process.env.HOME || '', '.claude', 'settings');
  const profiles: { name: string; path: string; model?: string; provider?: string }[] = [
    { name: 'Default', path: '', provider: 'Anthropic' },
  ];

  try {
    const files = await readdir(settingsDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = join(settingsDir, file);
      try {
        const content = JSON.parse(await readFile(filePath, 'utf-8')) as ClaudeSettings & {
          env?: Record<string, string>;
        };
        const name = basename(file, '.json');
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
    // ~/.claude/settings/ doesn't exist
  }

  return profiles;
}

/**
 * Return provider-specific metadata for one provider + interface pair.
 */
export async function getProviderInfo(
  selection: ProviderSelection,
): Promise<ProviderInfo> {
  const availability = await getProviderAvailability();
  const interfaces = getInterfaceOptions(selection.provider, availability);

  let permissionMode = 'unknown';
  let model = 'default';
  let models: { value: string; displayName: string; description: string }[] = [];
  let costInfo: { totalCostUsd: number; usage: Record<string, unknown>; modelUsage: Record<string, unknown> } | null = null;
  let rateLimits: Record<string, { resetsAt?: number; status: string }> = {};
  let accountInfo: { email?: string; subscriptionType?: string; apiProvider?: string } | null = null;

  if (selection.provider === 'codex') {
    const codexConfig = await getCodexConfig();
    permissionMode = 'full-auto';
    model = typeof codexConfig.model === 'string' ? codexConfig.model : 'default';
    models = await getCodexModels();
    accountInfo = await getCodexAccountInfo();
  } else {
    try {
      const provider = await getClaudeProvider(selection);

      if (provider instanceof ClaudeSdkProvider) {
        permissionMode = provider.getPermissionMode();
        model = provider.getCurrentModelId() || 'default';
        models = provider.getModels() || [];
        costInfo = provider.getLastResult();
        rateLimits = provider.getRateLimits();
        accountInfo = provider.getAccountInfo();
      } else {
        permissionMode = 'cli-default';
      }
    } catch {
      if (selection.interface === 'cli') {
        permissionMode = 'cli-default';
      }
    }

    if (!accountInfo) {
      accountInfo = getAccountInfoFromCredentials();
    }
  }

  return {
    provider: selection.provider,
    interface: selection.interface,
    permissionMode,
    model,
    models,
    costInfo,
    rateLimits,
    accountInfo,
    interfaces,
  };
}

async function getSessionInfoForSelection(
  selection: ProviderSelection,
  workingDirectory?: string,
  sessionId?: string | null,
) {
  if (!sessionId) return null;

  if (selection.provider === 'codex') {
    return getCodexSessionInfo(sessionId);
  }

  if (!workingDirectory) return null;
  return getSessionInfo(workingDirectory, sessionId);
}

export async function getProviderSettingsSummary(options: {
  selection: ProviderSelection;
  workingDirectory?: string;
  sessionId?: string | null;
  selectedModel?: string | null;
  activeProvider?: ChatProvider;
}): Promise<ProviderSettingsSummary> {
  const { selection, workingDirectory, sessionId, selectedModel, activeProvider } = options;

  const [availability, providerInfo, mcpServers, claudeConfig, sessionInfo, usageQuota] = await Promise.all([
    getProviderAvailability(),
    getProviderInfo(selection),
    getMcpServers(workingDirectory, selection),
    getClaudeConfig(selection),
    getSessionInfoForSelection(selection, workingDirectory, sessionId),
    selection.provider === 'claude' ? fetchUsageQuota().catch(() => null) : Promise.resolve(null),
  ]);

  // Resolve reasoning / effort level
  let reasoningLevel: string | null = null;
  if (selection.provider === 'codex') {
    const codexCfg = claudeConfig as Record<string, unknown>;
    if (typeof codexCfg.model_reasoning_effort === 'string') {
      reasoningLevel = codexCfg.model_reasoning_effort;
    }
  } else {
    const claudeCfg = claudeConfig as Record<string, unknown>;
    if (typeof claudeCfg.effortLevel === 'string') {
      reasoningLevel = claudeCfg.effortLevel;
    }
  }

  return {
    provider: selection.provider,
    label: PROVIDER_LABELS[selection.provider],
    active: activeProvider === selection.provider,
    available: Object.values(availability[selection.provider]).some(Boolean),
    interface: selection.interface,
    interfaces: providerInfo.interfaces,
    permissionMode: providerInfo.permissionMode,
    model: selectedModel || sessionInfo?.model || providerInfo.model,
    models: providerInfo.models,
    mcpServers,
    claudeConfig,
    tokenUsage: sessionInfo?.usage || null,
    costInfo: providerInfo.costInfo || null,
    rateLimits: providerInfo.rateLimits || {},
    accountInfo: providerInfo.accountInfo || null,
    reasoningLevel,
    usageQuota: usageQuota || null,
  };
}

export async function getAvailableProviderOptions(): Promise<ProviderOption[]> {
  const availability = await getProviderAvailability();
  return getProviderOptions(availability);
}
