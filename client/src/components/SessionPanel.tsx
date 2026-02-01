import type { Session, TokenUsage } from "@shared/types";

interface SessionPanelProps {
  sessions: Session[];
  currentSession: Session | null;
  currentModel: string | null;
  tokenUsage: TokenUsage | null;
  onSessionSelect: (sessionId: string) => void;
  onNewSession: () => void;
}

function truncatePrompt(prompt: string, maxLength = 40): string {
  if (!prompt) return "New session";
  if (prompt.length <= maxLength) return prompt;
  return prompt.slice(0, maxLength) + "...";
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function SessionPanel({
  sessions,
  currentSession,
  onSessionSelect,
  onNewSession,
}: SessionPanelProps) {
  return (
    <div className="px-3 py-2 bg-gray-900">
      <div className="flex items-center gap-2">
        <select
          value={currentSession?.id || ""}
          onChange={(e) => {
            if (e.target.value) {
              onSessionSelect(e.target.value);
            }
          }}
          className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-orange-500 truncate"
        >
          <option value="" disabled>
            Select a session...
          </option>
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {truncatePrompt(session.title)} ({formatRelativeTime(session.modified)})
            </option>
          ))}
        </select>
        <button
          onClick={onNewSession}
          className="px-2 py-1.5 bg-orange-600 hover:bg-orange-700 rounded text-sm text-white shrink-0"
          title="New session"
        >
          +
        </button>
      </div>
    </div>
  );
}
