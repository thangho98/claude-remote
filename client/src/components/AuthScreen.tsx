import { useState } from "react";

interface AuthScreenProps {
  onAuth: (token: string) => void;
  error?: string | null;
  isConnecting?: boolean;
  hasStoredToken?: boolean;
}

export function AuthScreen({ onAuth, error, isConnecting, hasStoredToken }: AuthScreenProps) {
  const [token, setToken] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (token.trim() && !isConnecting) {
      onAuth(token.trim());
    }
  };

  // Show simple loading state when reconnecting with stored token
  if (isConnecting && hasStoredToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 safe-area-inset-top safe-area-inset-bottom" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{ background: 'var(--accent)' }}>
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Claude Remote</h1>
          <div className="flex items-center justify-center gap-2" style={{ color: 'var(--text-muted)' }}>
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Reconnecting...</span>
          </div>
          {error && (
            <div className="mt-4 p-3 rounded-lg max-w-md mx-auto" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 safe-area-inset-top safe-area-inset-bottom" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{ background: 'var(--accent)' }}>
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Claude Remote</h1>
          <p className="mt-2" style={{ color: 'var(--text-muted)' }}>Access Claude Code from anywhere</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="token" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Access Token
            </label>
            <input
              type="password"
              id="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your token"
              disabled={isConnecting}
              className="w-full px-4 py-3 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50 transition-all"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-primary)',
              }}
              autoFocus
              autoComplete="off"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isConnecting || !token.trim()}
            className="w-full py-3 px-4 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: isConnecting || !token.trim() ? 'var(--text-muted)' : 'var(--accent)' }}
          >
            {isConnecting ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Connecting...
              </>
            ) : (
              "Connect"
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-sm mt-8" style={{ color: 'var(--text-muted)' }}>
          Configure AUTH_TOKEN in your server's .env file
        </p>
      </div>
    </div>
  );
}
