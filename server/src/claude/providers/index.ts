import type { ClaudeProvider, ClaudeProviderType } from "../types";
import { ClaudeCliProvider } from "./cli";
import { ClaudeSdkProvider } from "./sdk";

// Singleton instances
let cliProvider: ClaudeCliProvider | null = null;
let sdkProvider: ClaudeSdkProvider | null = null;
let currentProvider: ClaudeProvider | null = null;

/**
 * Get or create a provider instance
 */
function getProviderInstance(type: ClaudeProviderType): ClaudeProvider {
  switch (type) {
    case "cli":
      if (!cliProvider) {
        cliProvider = new ClaudeCliProvider();
      }
      return cliProvider;
    case "sdk":
      if (!sdkProvider) {
        sdkProvider = new ClaudeSdkProvider();
      }
      return sdkProvider;
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

/**
 * Get the current active provider
 * Falls back to CLI if SDK is not available
 */
export async function getClaudeProvider(): Promise<ClaudeProvider> {
  if (currentProvider) {
    return currentProvider;
  }

  // Check environment variable for preferred provider
  const preferredType = (process.env.CLAUDE_PROVIDER as ClaudeProviderType) || "cli";

  const provider = getProviderInstance(preferredType);
  const isAvailable = await provider.isAvailable();

  if (isAvailable) {
    currentProvider = provider;
    console.log(`✅ Using Claude ${provider.name.toUpperCase()} provider`);
    return provider;
  }

  // Fallback to CLI if SDK not available
  if (preferredType === "sdk") {
    console.warn("⚠️ SDK provider not available, falling back to CLI");
    const fallback = getProviderInstance("cli");
    const fallbackAvailable = await fallback.isAvailable();

    if (fallbackAvailable) {
      currentProvider = fallback;
      console.log(`✅ Using Claude ${fallback.name.toUpperCase()} provider (fallback)`);
      return fallback;
    }
  }

  throw new Error("No Claude provider available. Install Claude CLI or set ANTHROPIC_API_KEY.");
}

/**
 * Switch to a specific provider
 */
export async function setClaudeProvider(type: ClaudeProviderType): Promise<ClaudeProvider> {
  const provider = getProviderInstance(type);
  const isAvailable = await provider.isAvailable();

  if (!isAvailable) {
    throw new Error(`Provider ${type} is not available`);
  }

  currentProvider = provider;
  console.log(`🔄 Switched to Claude ${provider.name.toUpperCase()} provider`);
  return provider;
}

/**
 * Get the current provider type
 */
export function getCurrentProviderType(): ClaudeProviderType | null {
  return currentProvider?.name as ClaudeProviderType | null;
}

export { ClaudeCliProvider } from "./cli";
export { ClaudeSdkProvider } from "./sdk";
