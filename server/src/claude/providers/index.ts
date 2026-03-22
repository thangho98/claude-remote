import type {
  ClaudeProvider,
  ChatProviderType,
  ProviderInterfaceType,
  ProviderSelection,
} from '../types';
import { ClaudeCliProvider } from './cli';
import { CodexCliProvider } from './codex';
import { CodexSdkProvider } from './codexSdk';
import { ClaudeSdkProvider } from './sdk';

// Singleton instances
let claudeCliProvider: ClaudeCliProvider | null = null;
let claudeSdkProvider: ClaudeSdkProvider | null = null;
let codexCliProvider: CodexCliProvider | null = null;
let codexSdkProvider: CodexSdkProvider | null = null;

export const PROVIDER_LABELS: Record<ChatProviderType, string> = {
  claude: 'Claude',
  codex: 'Codex',
};

export const INTERFACE_LABELS: Record<ProviderInterfaceType, string> = {
  sdk: 'SDK',
  cli: 'CLI',
};

export const PROVIDER_INTERFACE_LABELS: Record<ChatProviderType, Record<ProviderInterfaceType, string>> = {
  claude: {
    sdk: 'Claude SDK',
    cli: 'Claude CLI',
  },
  codex: {
    sdk: 'Codex SDK',
    cli: 'Codex CLI',
  },
};

function isProvider(value: string | undefined | null): value is ChatProviderType {
  return value === 'claude' || value === 'codex';
}

function isInterface(value: string | undefined | null): value is ProviderInterfaceType {
  return value === 'sdk' || value === 'cli';
}

/**
 * Support both the new env model:
 *   AI_PROVIDER=claude|codex
 *   AI_INTERFACE=sdk|cli
 * and the old shorthand:
 *   AI_PROVIDER=sdk|cli|codex
 */
export function getDefaultProviderSelection(): ProviderSelection {
  const envProvider = process.env.AI_PROVIDER || process.env.CLAUDE_PROVIDER;
  const envInterface = process.env.AI_INTERFACE || process.env.ASSISTANT_INTERFACE;

  if (envProvider === 'sdk' || envProvider === 'cli') {
    return {
      provider: 'claude',
      interface: envProvider,
    };
  }

  if (envProvider === 'codex') {
    return {
      provider: 'codex',
      interface: isInterface(envInterface) ? envInterface : 'cli',
    };
  }

  return {
    provider: isProvider(envProvider) ? envProvider : 'claude',
    interface: isInterface(envInterface) ? envInterface : 'sdk',
  };
}

/**
 * Get or create a provider instance.
 */
function getProviderInstance(selection: ProviderSelection): ClaudeProvider {
  if (selection.provider === 'claude' && selection.interface === 'sdk') {
    if (!claudeSdkProvider) {
      claudeSdkProvider = new ClaudeSdkProvider();
    }
    return claudeSdkProvider;
  }

  if (selection.provider === 'claude' && selection.interface === 'cli') {
    if (!claudeCliProvider) {
      claudeCliProvider = new ClaudeCliProvider();
    }
    return claudeCliProvider;
  }

  if (selection.provider === 'codex' && selection.interface === 'sdk') {
    if (!codexSdkProvider) {
      codexSdkProvider = new CodexSdkProvider();
    }
    return codexSdkProvider;
  }

  if (!codexCliProvider) {
    codexCliProvider = new CodexCliProvider();
  }
  return codexCliProvider;
}

export async function getClaudeProvider(selection: ProviderSelection): Promise<ClaudeProvider> {
  const provider = getProviderInstance(selection);
  const isAvailable = await provider.isAvailable();

  if (!isAvailable) {
    throw new Error(`${PROVIDER_INTERFACE_LABELS[selection.provider][selection.interface]} is not available.`);
  }

  console.log(`✅ Using ${PROVIDER_INTERFACE_LABELS[selection.provider][selection.interface]} provider`);
  return provider;
}

export async function ensureProviderAvailable(selection: ProviderSelection): Promise<void> {
  await getClaudeProvider(selection);
}

export async function getProviderAvailability(): Promise<Record<ChatProviderType, Record<ProviderInterfaceType, boolean>>> {
  const [claudeSdk, claudeCli, codexSdk, codexCli] = await Promise.all([
    getProviderInstance({ provider: 'claude', interface: 'sdk' }).isAvailable(),
    getProviderInstance({ provider: 'claude', interface: 'cli' }).isAvailable(),
    getProviderInstance({ provider: 'codex', interface: 'sdk' }).isAvailable(),
    getProviderInstance({ provider: 'codex', interface: 'cli' }).isAvailable(),
  ]);

  return {
    claude: {
      sdk: claudeSdk,
      cli: claudeCli,
    },
    codex: {
      sdk: codexSdk,
      cli: codexCli,
    },
  };
}

export { ClaudeCliProvider } from './cli';
export { CodexCliProvider } from './codex';
export { CodexSdkProvider } from './codexSdk';
export { ClaudeSdkProvider } from './sdk';
