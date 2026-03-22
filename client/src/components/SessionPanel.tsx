import { useState } from 'react';
import { formatRelativeTime, truncatePrompt } from "../utils/format";
import type { ChatProvider, Session } from "@shared/types";
import { NewSessionProviderPicker } from './NewSessionProviderPicker';

interface SessionPanelProps {
  sessions: Session[];
  currentSession: Session | null;
  onSessionSelect: (session: Session) => void;
  onNewSession: (provider: ChatProvider) => void;
  onDeleteSession?: (sessionId: string) => void;
}

function getProviderBadgeStyle(provider: Session['provider']) {
  return provider === 'codex'
    ? {
        label: 'Codex',
        backgroundColor: 'color-mix(in srgb, #10b981 18%, transparent)',
        color: '#6ee7b7',
        borderColor: 'color-mix(in srgb, #10b981 40%, transparent)',
      }
    : {
        label: 'Claude',
        backgroundColor: 'color-mix(in srgb, #f97316 18%, transparent)',
        color: '#fdba74',
        borderColor: 'color-mix(in srgb, #f97316 40%, transparent)',
      };
}

export function SessionPanel({ sessions, currentSession, onSessionSelect, onNewSession, onDeleteSession }: SessionPanelProps) {
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const currentProviderBadge = currentSession ? getProviderBadgeStyle(currentSession.provider) : null;

  return (
    <>
      <div className="px-3 py-2" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="flex items-center gap-2">
          <select
            value={currentSession?.id || ""}
            onChange={(e) => {
              if (!e.target.value) return;
              const session = sessions.find((entry) => entry.id === e.target.value);
              if (session) {
                onSessionSelect(session);
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
                [{session.provider === 'codex' ? 'Codex' : 'Claude'}] {truncatePrompt(session.title)} ({formatRelativeTime(session.modified)})
              </option>
            ))}
          </select>
          {currentProviderBadge && (
            <span
              className="px-2 py-1 rounded-sm text-[11px] font-medium border shrink-0"
              style={{
                backgroundColor: currentProviderBadge.backgroundColor,
                color: currentProviderBadge.color,
                borderColor: currentProviderBadge.borderColor,
              }}
              title={`Current provider: ${currentProviderBadge.label}`}
            >
              {currentProviderBadge.label}
            </span>
          )}
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
            onClick={() => setShowProviderPicker(true)}
            className="px-2 py-1.5 rounded-sm text-sm shrink-0"
            style={{ backgroundColor: "var(--accent)", color: "var(--text-primary)" }}
            title="New session"
          >
            +
          </button>
        </div>
      </div>
      {showProviderPicker && (
        <NewSessionProviderPicker
          onSelect={onNewSession}
          onClose={() => setShowProviderPicker(false)}
        />
      )}
    </>
  );
}
