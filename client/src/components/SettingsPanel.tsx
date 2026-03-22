import { useEffect, useState } from 'react';
import type { ChatProvider, ProviderInterface, ProviderSettingsSummary } from '@shared/types';
import { useTheme } from '../hooks/useTheme';

interface SettingsPanelProps {
  settings: {
    provider: ChatProvider;
    interface: ProviderInterface;
    providers: ProviderSettingsSummary[];
    permissionMode: string;
    model: string;
    models: { value: string; displayName: string; description: string }[];
    mcpServers: { name: string; type: string; status: string }[];
    claudeConfig: Record<string, unknown>;
    tokenUsage: { inputTokens: number; outputTokens: number; cacheCreationTokens: number; cacheReadTokens: number; totalTokens: number } | null;
    costInfo: { totalCostUsd: number; usage: Record<string, unknown>; modelUsage: Record<string, unknown> } | null;
    rateLimits: Record<string, { resetsAt?: number; status: string }>;
    accountInfo: { email?: string; subscriptionType?: string; apiProvider?: string } | null;
    usageQuota: {
      five_hour: { utilization: number; resets_at: string } | null;
      seven_day: { utilization: number; resets_at: string } | null;
      seven_day_sonnet: { utilization: number; resets_at: string } | null;
      seven_day_opus: { utilization: number; resets_at: string } | null;
    } | null;
  } | null;
  onProviderChange?: (provider: ChatProvider) => void;
  onInterfaceChange?: (provider: ChatProvider, interfaceType: ProviderInterface) => void;
  onLogout?: () => void;
}

const APP_VERSION = '0.1.0';

function getProviderAuthHint(
  provider: ChatProvider,
  interfaceType: ProviderInterface,
): { title: string; detail: string; command?: string } {
  if (provider === 'codex') {
    return {
      title: 'No local Codex auth found',
      detail: 'Run `codex login` or provide `OPENAI_API_KEY` for Codex.',
      command: 'codex login',
    };
  }

  if (interfaceType === 'sdk') {
    return {
      title: 'Not logged in',
      detail: 'Run `claude login` in terminal to authenticate.',
      command: 'claude login',
    };
  }

  return {
    title: 'Using API Key',
    detail: 'Authenticated via ANTHROPIC_API_KEY',
  };
}

function formatResetTime(isoString: string): string {
  const resetDate = new Date(isoString);
  const now = new Date();
  const diffMs = resetDate.getTime() - now.getTime();
  if (diffMs <= 0) return 'Resetting...';
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const timeStr = resetDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop();
  if (hours >= 24) {
    return `Resets ${resetDate.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr} (${tz})`;
  }
  if (hours > 0) return `Resets in ${hours}h ${mins}m (${tz})`;
  return `Resets in ${mins}m`;
}

function UsageBar({ label, utilization, resetsAt }: { label: string; utilization: number; resetsAt: string }) {
  const pct = Math.round(utilization);
  const barColor = pct >= 80 ? 'var(--error)' : pct >= 50 ? 'var(--warning)' : 'var(--accent)';
  return (
    <div className="py-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
      </div>
      <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs font-semibold" style={{ color: barColor }}>{pct}% used</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatResetTime(resetsAt)}</span>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
      {children}
    </h3>
  );
}

function SettingRow({
  label,
  value,
  badge,
  badgeColor,
}: {
  label: string;
  value: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 gap-3">
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <div className="flex items-center gap-2 text-right">
        {badge && (
          <span
            className="px-2 py-0.5 text-[10px] font-medium rounded-full uppercase"
            style={{
              background: badgeColor ?? 'var(--accent)',
              color: '#fff',
            }}
          >
            {badge}
          </span>
        )}
        <span className="text-sm font-medium break-all" style={{ color: 'var(--text-primary)' }}>
          {value}
        </span>
      </div>
    </div>
  );
}

function AccountBlock({
  summary,
}: {
  summary: ProviderSettingsSummary;
}) {
  const provider = summary.provider === 'codex' ? 'codex' : 'claude';
  const interfaceType = summary.interface === 'cli' ? 'cli' : 'sdk';
  const authHint = getProviderAuthHint(provider, interfaceType);

  if (summary.accountInfo && (summary.accountInfo.email || summary.accountInfo.subscriptionType || summary.accountInfo.apiProvider)) {
    return (
      <div className="space-y-0 divide-y" style={{ borderColor: 'var(--border-primary)' }}>
        {summary.accountInfo.email && (
          <SettingRow label="Email" value={summary.accountInfo.email} />
        )}
        {summary.accountInfo.subscriptionType && (
          <SettingRow label="Plan" value={summary.accountInfo.subscriptionType} />
        )}
        {summary.accountInfo.apiProvider && summary.accountInfo.apiProvider !== 'firstParty' && (
          <SettingRow label="API Provider" value={summary.accountInfo.apiProvider} />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg p-3 flex items-center gap-3" style={{ background: authHint.command ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-tertiary)' }}>
      <svg
        className="w-5 h-5 shrink-0"
        style={{ color: authHint.command ? 'var(--error)' : 'var(--text-muted)' }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        {authHint.command ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        )}
      </svg>
      <div>
        <div className="text-sm font-medium" style={{ color: authHint.command ? 'var(--error)' : 'var(--text-secondary)' }}>
          {authHint.title}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {authHint.command ? (
            <>
              Run <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-tertiary)' }}>{authHint.command}</code> in terminal to authenticate
            </>
          ) : (
            authHint.detail
          )}
        </div>
      </div>
    </div>
  );
}

function ProviderCard({
  summary,
  onProviderChange,
  onInterfaceChange,
}: {
  summary: ProviderSettingsSummary;
  onProviderChange?: (provider: ChatProvider) => void;
  onInterfaceChange?: (provider: ChatProvider, interfaceType: ProviderInterface) => void;
}) {
  const provider = summary.provider === 'codex' ? 'codex' : 'claude';
  const interfaceType = summary.interface === 'cli' ? 'cli' : 'sdk';
  const interfaces = Array.isArray(summary.interfaces) ? summary.interfaces : [];
  const models = Array.isArray(summary.models) ? summary.models : [];
  const mcpServers = Array.isArray(summary.mcpServers) ? summary.mcpServers : [];

  return (
    <section
      className="rounded-xl p-4 space-y-4"
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            {summary.label}
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {interfaceType.toUpperCase()} interface
          </p>
        </div>
        <div className="flex items-center gap-2">
          {summary.active && (
            <span
              className="px-2 py-0.5 text-[10px] font-medium rounded-full uppercase"
              style={{ background: 'var(--success)', color: '#fff' }}
            >
              Active
            </span>
          )}
          {!summary.active && (
            <button
              type="button"
              disabled={!summary.available}
              onClick={() => summary.available && onProviderChange?.(provider)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:cursor-not-allowed"
              style={{
                background: summary.available ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: summary.available ? 'white' : 'var(--text-muted)',
                opacity: summary.available ? 1 : 0.6,
              }}
            >
              {summary.available ? 'Use In Chat' : 'Unavailable'}
            </button>
          )}
        </div>
      </div>

      <div>
        <SectionHeader>Interface</SectionHeader>
        <div className="flex flex-wrap gap-2">
          {interfaces.map((option) => {
            const isActive = option.value === interfaceType;
            return (
              <button
                key={`${provider}-${option.value}`}
                type="button"
                disabled={!option.available}
                onClick={() => option.available && onInterfaceChange?.(provider, option.value)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:cursor-not-allowed"
                style={{
                  background: isActive ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: isActive ? 'white' : option.available ? 'var(--text-primary)' : 'var(--text-muted)',
                  opacity: option.available ? 1 : 0.5,
                }}
                title={option.available ? option.label : `${option.label} not available`}
              >
                {option.value.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-0 divide-y" style={{ borderColor: 'var(--border-primary)' }}>
        <SettingRow
          label="Interface"
          value={interfaceType.toUpperCase()}
          badge={interfaceType}
          badgeColor="var(--accent)"
        />
        <SettingRow
          label="Permission Mode"
          value={summary.permissionMode}
          badge={summary.permissionMode}
          badgeColor={
            summary.permissionMode === 'default'
              ? 'var(--accent)'
              : summary.permissionMode === 'plan'
                ? 'var(--warning)'
                : 'var(--error)'
          }
        />
        <SettingRow label="Model" value={summary.model || 'Default'} />
        {summary.reasoningLevel && (
          <SettingRow
            label={provider === 'codex' ? 'Reasoning' : 'Thinking Effort'}
            value={summary.reasoningLevel}
            badge={summary.reasoningLevel}
            badgeColor={
              summary.reasoningLevel === 'xhigh' || summary.reasoningLevel === 'max'
                ? 'var(--error)'
                : summary.reasoningLevel === 'high'
                  ? 'var(--warning)'
                  : 'var(--accent)'
            }
          />
        )}
      </div>

      <div>
        <SectionHeader>Models</SectionHeader>
        {models.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {models.map((model) => {
              const isActive =
                summary.model === model.value ||
                (model.value === 'default' &&
                  !models.some((entry) => entry.value !== 'default' && summary.model === entry.value));

              return (
                <span
                  key={`${provider}-${model.value}`}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium"
                  style={{
                    background: isActive ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: isActive ? 'white' : 'var(--text-muted)',
                  }}
                  title={model.description}
                >
                  {model.displayName}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No model metadata available.
          </p>
        )}
      </div>

      <div>
        <SectionHeader>MCP Servers</SectionHeader>
        {mcpServers.length > 0 ? (
          <div className="space-y-2">
            {mcpServers.map((server) => (
              <div
                key={`${provider}-${server.name}`}
                className="flex items-center justify-between py-2 px-3 rounded-lg"
                style={{ background: 'var(--bg-tertiary)' }}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background:
                        server.status === 'running'
                          ? 'var(--success)'
                          : server.status === 'error'
                            ? 'var(--error)'
                            : 'var(--warning)',
                    }}
                  />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {server.name}
                  </span>
                </div>
                <span
                  className="px-2 py-0.5 text-[10px] font-medium rounded uppercase"
                  style={{
                    background: 'var(--bg-primary)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-primary)',
                  }}
                >
                  {server.type}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No MCP servers configured.
          </p>
        )}
      </div>

      {summary.usageQuota && (
        <div>
          <SectionHeader>Usage</SectionHeader>
          <div className="divide-y" style={{ borderColor: 'var(--border-primary)' }}>
            {summary.usageQuota.five_hour && (
              <UsageBar label="Current session" utilization={summary.usageQuota.five_hour.utilization} resetsAt={summary.usageQuota.five_hour.resets_at} />
            )}
            {summary.usageQuota.seven_day && (
              <UsageBar label="Current week (all models)" utilization={summary.usageQuota.seven_day.utilization} resetsAt={summary.usageQuota.seven_day.resets_at} />
            )}
            {summary.usageQuota.seven_day_sonnet && (
              <UsageBar label="Current week (Sonnet)" utilization={summary.usageQuota.seven_day_sonnet.utilization} resetsAt={summary.usageQuota.seven_day_sonnet.resets_at} />
            )}
            {summary.usageQuota.seven_day_opus && (
              <UsageBar label="Current week (Opus)" utilization={summary.usageQuota.seven_day_opus.utilization} resetsAt={summary.usageQuota.seven_day_opus.resets_at} />
            )}
          </div>
        </div>
      )}

      <div>
        <SectionHeader>Account</SectionHeader>
        <AccountBlock summary={summary} />
      </div>
    </section>
  );
}

export function SettingsPanel({
  settings,
  onProviderChange,
  onInterfaceChange,
  onLogout,
}: SettingsPanelProps) {
  const { theme, toggleTheme, isDark } = useTheme();
  const providerCards = Array.isArray(settings?.providers) ? settings.providers : [];
  const activeProvider: ChatProvider = settings?.provider === 'codex' ? 'codex' : 'claude';
  const [selectedTab, setSelectedTab] = useState<ChatProvider>(activeProvider);

  useEffect(() => {
    if (!providerCards.some((summary) => summary.provider === selectedTab)) {
      setSelectedTab(activeProvider);
    }
  }, [activeProvider, providerCards, selectedTab]);

  const visibleProvider = providerCards.find((summary) => summary.provider === selectedTab) || providerCards[0] || null;

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Settings
        </h2>

        <section
          className="rounded-xl p-4"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          <SectionHeader>About</SectionHeader>

          <div className="space-y-0 divide-y" style={{ borderColor: 'var(--border-primary)' }}>
            <SettingRow label="Version" value={APP_VERSION} />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Theme
              </span>
              <button
                onClick={toggleTheme}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-primary)',
                }}
              >
                {isDark ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text-primary)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text-primary)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
                <span className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
                  {theme}
                </span>
              </button>
            </div>
          </div>
        </section>

        {providerCards.length > 0 && (
          <section
            className="rounded-xl p-4 space-y-4"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <SectionHeader>Assistants</SectionHeader>
            <div className="flex gap-2">
              {providerCards.map((summary) => {
                const isActiveTab = summary.provider === selectedTab;
                return (
                  <button
                    key={summary.provider}
                    type="button"
                    onClick={() => setSelectedTab(summary.provider)}
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      background: isActiveTab ? 'var(--accent)' : 'var(--bg-tertiary)',
                      color: isActiveTab ? 'white' : 'var(--text-secondary)',
                    }}
                  >
                    {summary.label}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {visibleProvider && (
          <ProviderCard
            key={visibleProvider.provider}
            summary={visibleProvider}
            onProviderChange={onProviderChange}
            onInterfaceChange={onInterfaceChange}
          />
        )}

        {onLogout && (
          <section className="px-4 pb-8">
            <button
              onClick={onLogout}
              className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
              style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
