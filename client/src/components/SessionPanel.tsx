import { formatRelativeTime, truncatePrompt } from "../utils/format";
import type { Session } from "@shared/types";

interface SessionPanelProps {
  sessions: Session[];
  currentSession: Session | null;
  onSessionSelect: (sessionId: string) => void;
  onNewSession: () => void;
}

export function SessionPanel({ sessions, currentSession, onSessionSelect, onNewSession }: SessionPanelProps) {
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
          className="flex-1 bg-gray-800 border border-gray-600 rounded-sm px-2 py-1.5 text-sm text-gray-200 focus:outline-hidden focus:border-orange-500 truncate"
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
          className="px-2 py-1.5 bg-orange-600 hover:bg-orange-700 rounded-sm text-sm text-white shrink-0"
          title="New session"
        >
          +
        </button>
      </div>
    </div>
  );
}
