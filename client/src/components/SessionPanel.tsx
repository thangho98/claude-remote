import { formatRelativeTime, truncatePrompt } from "../utils/format";
import type { Session } from "@shared/types";

interface SessionPanelProps {
  sessions: Session[];
  currentSession: Session | null;
  onSessionSelect: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession?: (sessionId: string) => void;
}

export function SessionPanel({ sessions, currentSession, onSessionSelect, onNewSession, onDeleteSession }: SessionPanelProps) {
  return (
    <div className="px-3 py-2" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="flex items-center gap-2">
        <select
          value={currentSession?.id || ""}
          onChange={(e) => {
            if (e.target.value) {
              onSessionSelect(e.target.value);
            }
          }}
          className="flex-1 border rounded-sm px-2 py-1.5 text-sm focus:outline-hidden truncate"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-primary)",
            color: "var(--text-secondary)",
          }}
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
        {/* Delete current session */}
        {currentSession && onDeleteSession && (
          <button
            onClick={() => {
              if (confirm(`Delete session "${truncatePrompt(currentSession.title)}"?`)) {
                onDeleteSession(currentSession.id);
              }
            }}
            className="p-1.5 rounded-sm shrink-0 transition-colors"
            style={{ color: "var(--text-muted)" }}
            title="Delete session"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
        <button
          onClick={onNewSession}
          className="px-2 py-1.5 rounded-sm text-sm shrink-0"
          style={{ backgroundColor: "var(--accent)", color: "var(--text-primary)" }}
          title="New session"
        >
          +
        </button>
      </div>
    </div>
  );
}
