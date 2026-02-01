import { useRef, useEffect, useState } from "react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import type { Message, TokenUsage, Session } from "@shared/types";

interface ChatPanelProps {
  messages: Message[];
  onSend: (content: string) => void;
  isLoading?: boolean;
  currentFile?: string | null;
  currentModel?: string | null;
  tokenUsage?: TokenUsage | null;
  // Session selector props (for mobile)
  sessions?: Session[];
  currentSession?: Session | null;
  onSessionSelect?: (session: Session) => void;
  onNewSession?: () => void;
  showSessionSelector?: boolean;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function truncatePrompt(text: string, maxLen = 50): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

// Session selector modal for mobile
function SessionModal({
  sessions,
  currentSession,
  onSelect,
  onNewSession,
  onClose,
}: {
  sessions: Session[];
  currentSession: Session | null;
  onSelect: (session: Session) => void;
  onNewSession: () => void;
  onClose: () => void;
}) {
  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal */}
      <div
        className="relative w-full max-h-[70vh] bg-gray-800 rounded-t-2xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center py-2">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Sessions</h2>
          <button
            onClick={() => {
              onNewSession();
              onClose();
            }}
            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 rounded-lg text-sm text-white font-medium transition-colors"
          >
            + New
          </button>
        </div>

        {/* Session list */}
        <div className="overflow-y-auto max-h-[calc(70vh-100px)]">
          {sessions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>No sessions yet</p>
              <p className="text-sm mt-1">Start a new conversation</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => {
                    onSelect(session);
                    onClose();
                  }}
                  className={`w-full px-4 py-3 text-left transition-colors ${
                    currentSession?.id === session.id
                      ? "bg-orange-600/20 border-l-2 border-orange-500"
                      : "hover:bg-gray-700/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {truncatePrompt(session.title, 60)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatRelativeTime(session.modified)}
                      </p>
                    </div>
                    {currentSession?.id === session.id && (
                      <span className="shrink-0 w-2 h-2 mt-2 bg-orange-500 rounded-full" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Safe area padding for bottom */}
        <div className="pb-safe bg-gray-800" />
      </div>
    </div>
  );
}

export function ChatPanel({
  messages,
  onSend,
  isLoading,
  currentFile,
  currentModel,
  tokenUsage,
  sessions,
  currentSession,
  onSessionSelect,
  onNewSession,
  showSessionSelector,
}: ChatPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showSessionModal, setShowSessionModal] = useState(false);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      // Use requestAnimationFrame to ensure DOM is updated before scrolling
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Session selector bar for mobile */}
      {showSessionSelector && sessions && onSessionSelect && onNewSession && (
        <button
          onClick={() => setShowSessionModal(true)}
          className="px-3 py-2.5 border-b border-gray-700 bg-gray-800/50 flex items-center gap-2 w-full text-left active:bg-gray-700/50 transition-colors"
        >
          <svg
            className="w-4 h-4 text-gray-400 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <span className="flex-1 text-gray-200 truncate">
            {currentSession
              ? truncatePrompt(currentSession.title, 40)
              : "Select a session..."}
          </span>
          <svg
            className="w-4 h-4 text-gray-500 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      )}

      {/* Session modal */}
      {showSessionModal && sessions && onSessionSelect && onNewSession && (
        <SessionModal
          sessions={sessions}
          currentSession={currentSession ?? null}
          onSelect={onSessionSelect}
          onNewSession={onNewSession}
          onClose={() => setShowSessionModal(false)}
        />
      )}

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-gray-500">
              <svg
                className="w-12 h-12 mx-auto mb-3 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <p className="text-sm">Start a conversation</p>
            </div>
          </div>
        ) : (
          <MessageList messages={messages} />
        )}
      </div>

      {/* Input */}
      <MessageInput
        onSend={onSend}
        disabled={isLoading}
        placeholder={isLoading ? "Claude is thinking..." : "Ask anything..."}
        currentFile={currentFile}
        currentModel={currentModel}
        tokenUsage={tokenUsage}
      />
    </div>
  );
}
