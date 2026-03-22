import { useTheme } from '../hooks/useTheme';

interface SettingsPanelProps {
  settings: {
    provider: string;
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
  onLogout?: () => void;
}

const APP_VERSION = '0.1.0';

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
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
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
    <h3
      className="text-xs font-semibold uppercase tracking-wider mb-3"
      style={{ color: 'var(--text-muted)' }}
    >
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
    <div className="flex items-center justify-between py-2">
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <div className="flex items-center gap-2">
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
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {value}
        </span>
      </div>
    </div>
  );
}

export function SettingsPanel({ settings, onLogout }: SettingsPanelProps) {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Page title */}
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Settings
        </h2>

        {/* Provider Section */}
        <section
          className="rounded-xl p-4"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          <SectionHeader>Provider</SectionHeader>

          {settings ? (
            <div className="space-y-0 divide-y" style={{ borderColor: 'var(--border-primary)' }}>
              <SettingRow
                label="Provider"
                value={settings.provider.toUpperCase()}
                badge={settings.provider === 'sdk' ? 'Active' : 'Active'}
                badgeColor="var(--success)"
              />
              <SettingRow
                label="Permission Mode"
                value={settings.permissionMode}
                badge={settings.permissionMode}
                badgeColor={
                  settings.permissionMode === 'default'
                    ? 'var(--accent)'
                    : settings.permissionMode === 'plan'
                      ? 'var(--warning)'
                      : 'var(--error)'
                }
              />
              {/* Model selector */}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Model</span>
                {settings.models.length > 0 ? (
                  <div className="flex gap-1.5">
                    {settings.models.map((m) => (
                      <button
                        key={m.value}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: settings.model.includes(m.value) || (m.value === 'default' && !settings.models.some(x => x.value !== 'default' && settings.model.includes(x.value)))
                            ? 'var(--accent)' : 'var(--bg-tertiary)',
                          color: settings.model.includes(m.value) || (m.value === 'default' && !settings.models.some(x => x.value !== 'default' && settings.model.includes(x.value)))
                            ? 'white' : 'var(--text-muted)',
                        }}
                        title={m.description}
                      >
                        {m.displayName.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{settings.model || 'Default'}</span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm py-2" style={{ color: 'var(--text-muted)' }}>
              Loading provider info...
            </p>
          )}
        </section>

        {/* MCP Servers Section */}
        <section
          className="rounded-xl p-4"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          <SectionHeader>MCP Servers</SectionHeader>

          {settings && settings.mcpServers.length > 0 ? (
            <div className="space-y-2">
              {settings.mcpServers.map((server) => (
                <div
                  key={server.name}
                  className="flex items-center justify-between py-2 px-3 rounded-lg"
                  style={{ background: 'var(--bg-tertiary)' }}
                >
                  <div className="flex items-center gap-2.5">
                    {/* Status dot */}
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
                    <span
                      className="text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
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
          ) : settings ? (
            <p className="text-sm py-2" style={{ color: 'var(--text-muted)' }}>
              No MCP servers configured.
            </p>
          ) : (
            <p className="text-sm py-2" style={{ color: 'var(--text-muted)' }}>
              Loading...
            </p>
          )}
        </section>

        {/* Usage Quota Section */}
        {settings?.usageQuota && (
          <section
            className="rounded-xl p-4"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <SectionHeader>Usage</SectionHeader>
            <div className="divide-y" style={{ borderColor: 'var(--border-primary)' }}>
              {settings.usageQuota.five_hour && (
                <UsageBar label="Current session" utilization={settings.usageQuota.five_hour.utilization} resetsAt={settings.usageQuota.five_hour.resets_at} />
              )}
              {settings.usageQuota.seven_day && (
                <UsageBar label="Current week (all models)" utilization={settings.usageQuota.seven_day.utilization} resetsAt={settings.usageQuota.seven_day.resets_at} />
              )}
              {settings.usageQuota.seven_day_sonnet && (
                <UsageBar label="Current week (Sonnet)" utilization={settings.usageQuota.seven_day_sonnet.utilization} resetsAt={settings.usageQuota.seven_day_sonnet.resets_at} />
              )}
              {settings.usageQuota.seven_day_opus && (
                <UsageBar label="Current week (Opus)" utilization={settings.usageQuota.seven_day_opus.utilization} resetsAt={settings.usageQuota.seven_day_opus.resets_at} />
              )}
            </div>
          </section>
        )}

        {/* Account Section */}
        <section
          className="rounded-xl p-4"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          <SectionHeader>Account</SectionHeader>

          {settings?.accountInfo && (settings.accountInfo.email || settings.accountInfo.subscriptionType) ? (
            <div className="space-y-0 divide-y" style={{ borderColor: 'var(--border-primary)' }}>
              {settings.accountInfo.email && (
                <SettingRow label="Email" value={settings.accountInfo.email} />
              )}
              {settings.accountInfo.subscriptionType && (
                <SettingRow label="Plan" value={settings.accountInfo.subscriptionType} />
              )}
              {settings.accountInfo.apiProvider && settings.accountInfo.apiProvider !== 'firstParty' && (
                <SettingRow label="API Provider" value={settings.accountInfo.apiProvider} />
              )}
            </div>
          ) : settings?.provider === 'sdk' ? (
            <div className="rounded-lg p-3 flex items-center gap-3" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
              <svg className="w-5 h-5 shrink-0" style={{ color: 'var(--error)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--error)' }}>Not logged in</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Run <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-tertiary)' }}>claude login</code> in terminal to authenticate
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg p-3 flex items-center gap-3" style={{ background: 'var(--bg-tertiary)' }}>
              <svg className="w-5 h-5 shrink-0" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Using API Key</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Authenticated via ANTHROPIC_API_KEY</div>
              </div>
            </div>
          )}
        </section>

        {/* About Section */}
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

        {/* Logout */}
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
