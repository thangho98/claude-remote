import { useRef, useEffect, useState, useCallback, memo } from "react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { formatRelativeTime, truncatePrompt } from "../utils/format";
import type { Message, TokenUsage, Session, SlashCommand, SettingsProfile } from "@shared/types";

interface ChatPanelProps {
  messages: Message[];
  onSend: (content: string) => void;
  isLoading?: boolean;
  isThinking?: boolean;
  currentFile?: string | null;
  tokenUsage?: TokenUsage | null;
  // Session selector props (for mobile)
  sessions?: Session[];
  currentSession?: Session | null;
  onSessionSelect?: (session: Session) => void;
  onNewSession?: () => void;
  showSessionSelector?: boolean;
  // Slash commands
  commands?: SlashCommand[];
  // Model selection
  models?: { value: string; displayName: string; description: string }[];
  currentModel?: string;
  onModelChange?: (model: string) => void;
  // Settings profiles
  profiles?: SettingsProfile[];
  currentProfile?: SettingsProfile | null;
  onProfileChange?: (profile: SettingsProfile) => void;
}

// Session selector modal for mobile
const SessionModal = memo(function SessionModal({
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
        className="relative w-full max-h-[70vh] rounded-t-2xl overflow-hidden animate-slide-up"
        style={{ backgroundColor: "var(--bg-secondary)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center py-2">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--border-primary)" }} />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between px-4 pb-3 border-b"
          style={{ borderColor: "var(--border-primary)" }}
        >
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Sessions</h2>
          <button
            onClick={() => {
              onNewSession();
              onClose();
            }}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: "var(--accent)", color: "var(--text-primary)" }}
          >
            + New
          </button>
        </div>

        {/* Session list */}
        <div className="overflow-y-auto max-h-[calc(70vh-100px)]">
          {sessions.length === 0 ? (
            <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>
              <p>No sessions yet</p>
              <p className="text-sm mt-1">Start a new conversation</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--border-primary)" }}>
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => {
                    onSelect(session);
                    onClose();
                  }}
                  className={`w-full px-4 py-3 text-left transition-colors ${
                    currentSession?.id === session.id
                      ? "border-l-2"
                      : ""
                  }`}
                  style={
                    currentSession?.id === session.id
                      ? { backgroundColor: "color-mix(in srgb, var(--accent) 20%, transparent)", borderColor: "var(--accent)" }
                      : {}
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {truncatePrompt(session.title, 60)}
                      </p>
                      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                        {formatRelativeTime(session.modified)}
                      </p>
                    </div>
                    {currentSession?.id === session.id && (
                      <span className="shrink-0 w-2 h-2 mt-2 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Safe area padding for bottom */}
        <div className="pb-safe" style={{ backgroundColor: "var(--bg-secondary)" }} />
      </div>
    </div>
  );
});

export function ChatPanel({
  messages,
  onSend,
  isLoading,
  isThinking,
  currentFile,
  tokenUsage,
  sessions,
  currentSession,
  onSessionSelect,
  onNewSession,
  showSessionSelector,
  commands,
  models,
  currentModel,
  onModelChange,
  profiles,
  currentProfile,
  onProfileChange,
}: ChatPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const closeSessionModal = useCallback(() => setShowSessionModal(false), []);

  // Auto-scroll to bottom when new messages arrive or thinking starts
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  }, [messages, isThinking]);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* Session selector bar for mobile */}
      {showSessionSelector && sessions && onSessionSelect && onNewSession && (
        <button
          onClick={() => setShowSessionModal(true)}
          className="px-3 py-2.5 border-b flex items-center gap-2 w-full text-left transition-colors"
          style={{
            borderColor: "var(--border-primary)",
            backgroundColor: "color-mix(in srgb, var(--bg-secondary) 50%, transparent)",
          }}
        >
          <svg
            className="w-4 h-4 shrink-0"
            style={{ color: "var(--text-tertiary)" }}
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
          <span className="flex-1 truncate" style={{ color: "var(--text-secondary)" }}>
            {currentSession
              ? truncatePrompt(currentSession.title, 40)
              : "Select a session..."}
          </span>
          <svg
            className="w-4 h-4 shrink-0"
            style={{ color: "var(--text-muted)" }}
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
          onClose={closeSessionModal}
        />
      )}

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center" style={{ color: "var(--text-muted)" }}>
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

        {/* Thinking indicator */}
        {isThinking && (
          <div
            className="flex items-center gap-3 px-4 py-3 border-t"
            style={{
              backgroundColor: "color-mix(in srgb, var(--bg-secondary) 50%, transparent)",
              borderColor: "var(--border-primary)",
            }}
          >
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: "var(--accent)", animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: "var(--accent)", animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: "var(--accent)", animationDelay: "300ms" }} />
            </div>
            <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>Claude is thinking...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <MessageInput
        onSend={onSend}
        disabled={isLoading}
        placeholder={isThinking ? "Claude is thinking..." : isLoading ? "Processing..." : "Ask anything..."}
        currentFile={currentFile}
        tokenUsage={tokenUsage}
        commands={commands}
        models={models}
        currentModel={currentModel}
        onModelChange={onModelChange}
        profiles={profiles}
        currentProfile={currentProfile}
        onProfileChange={onProfileChange}
      />
    </div>
  );
}
