import { execSync } from 'child_process';

interface UsageWindow {
  utilization: number;
  resets_at: string;
}

export interface UsageQuota {
  five_hour: UsageWindow | null;
  seven_day: UsageWindow | null;
  seven_day_sonnet: UsageWindow | null;
  seven_day_opus: UsageWindow | null;
  extra_usage: {
    is_enabled: boolean;
    utilization: number | null;
  } | null;
}

let cachedToken: string | null = null;
let cachedQuota: { data: UsageQuota; fetchedAt: number } | null = null;
let cachedAccountInfo: { email?: string; subscriptionType?: string; apiProvider?: string } | null = null;
const CACHE_TTL = 60_000; // 1 minute cache

/**
 * Read OAuth credentials from macOS keychain
 */
function getOAuthCredentials(): { accessToken: string; subscriptionType?: string } | null {
  try {
    const raw = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w',
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    const creds = JSON.parse(raw);
    const oauth = creds?.claudeAiOauth;
    if (!oauth?.accessToken) return null;
    return { accessToken: oauth.accessToken, subscriptionType: oauth.subscriptionType };
  } catch {
    return null;
  }
}

function getOAuthToken(): string | null {
  if (cachedToken) return cachedToken;
  const creds = getOAuthCredentials();
  if (creds) {
    cachedToken = creds.accessToken;
    return cachedToken;
  }
  return null;
}

/**
 * Get account info from OAuth credentials + usage API
 * No extra API call needed — just reads from keychain + checks if token works
 */
export function getAccountInfoFromCredentials(): { email?: string; subscriptionType?: string; apiProvider?: string } | null {
  if (cachedAccountInfo) return cachedAccountInfo;
  const creds = getOAuthCredentials();
  if (!creds) return null;

  // Map subscription type to display name
  const planNames: Record<string, string> = {
    max: 'Claude Max', pro: 'Claude Pro', team: 'Claude Team', enterprise: 'Claude Enterprise',
  };
  const plan = creds.subscriptionType
    ? planNames[creds.subscriptionType] || `Claude ${creds.subscriptionType.charAt(0).toUpperCase() + creds.subscriptionType.slice(1)}`
    : undefined;

  cachedAccountInfo = {
    subscriptionType: plan,
    apiProvider: 'firstParty',
  };
  return cachedAccountInfo;
}

/**
 * Fetch usage quota from Anthropic API
 */
export async function fetchUsageQuota(): Promise<UsageQuota | null> {
  // Return cache if fresh
  if (cachedQuota && Date.now() - cachedQuota.fetchedAt < CACHE_TTL) {
    return cachedQuota.data;
  }

  const token = getOAuthToken();
  if (!token) return null;

  try {
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'anthropic-beta': 'oauth-2025-04-20',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      // Token might be expired — clear cache so next call re-reads keychain
      if (res.status === 401) cachedToken = null;
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    const quota: UsageQuota = {
      five_hour: parseWindow(data.five_hour),
      seven_day: parseWindow(data.seven_day),
      seven_day_sonnet: parseWindow(data.seven_day_sonnet),
      seven_day_opus: parseWindow(data.seven_day_opus),
      extra_usage: data.extra_usage
        ? { is_enabled: !!(data.extra_usage as Record<string, unknown>).is_enabled, utilization: (data.extra_usage as Record<string, unknown>).utilization as number | null }
        : null,
    };

    cachedQuota = { data: quota, fetchedAt: Date.now() };
    return quota;
  } catch (e) {
    console.warn('Failed to fetch usage quota:', e);
    return null;
  }
}

function parseWindow(raw: unknown): UsageWindow | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as Record<string, unknown>;
  if (typeof w.utilization !== 'number') return null;
  return { utilization: w.utilization, resets_at: w.resets_at as string };
}
