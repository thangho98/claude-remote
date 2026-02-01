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
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4 safe-area-inset-top safe-area-inset-bottom">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-600 rounded-2xl mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">Claude Remote</h1>
          <div className="flex items-center justify-center gap-2 text-gray-400">
            <svg
              className="animate-spin h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span>Reconnecting...</span>
          </div>
          {error && (
            <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg max-w-md mx-auto">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4 safe-area-inset-top safe-area-inset-bottom">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-600 rounded-2xl mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">Claude Remote</h1>
          <p className="text-gray-400 mt-2">Access Claude Code from anywhere</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="token"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Access Token
            </label>
            <input
              type="password"
              id="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your token"
              disabled={isConnecting}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-hidden focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-50 transition-all"
              autoFocus
              autoComplete="off"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isConnecting || !token.trim()}
            className="w-full py-3 px-4 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isConnecting ? (
              <>
                <svg
                  className="animate-spin h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Connecting...
              </>
            ) : (
              "Connect"
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-gray-500 text-sm mt-8">
          Configure AUTH_TOKEN in your server's .env file
        </p>
      </div>
    </div>
  );
}
