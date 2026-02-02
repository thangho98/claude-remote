import { useState, useRef, useEffect, useCallback } from "react";
import type { TokenUsage, SlashCommand } from "@shared/types";

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
  currentFile?: string | null;
  currentModel?: string | null;
  tokenUsage?: TokenUsage | null;
  commands?: SlashCommand[];
}

function formatTokens(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

const CONTEXT_WINDOW = 150000;

function ContextPieChart({
  percentage,
  current,
  max,
}: {
  percentage: number;
  current: number;
  max: number;
}) {
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const filled = (percentage / 100) * circumference;
  const remaining = circumference - filled;

  let color = "text-green-400";
  let bgColor = "bg-green-400";
  if (percentage > 70) {
    color = "text-red-400";
    bgColor = "bg-red-400";
  } else if (percentage > 40) {
    color = "text-yellow-400";
    bgColor = "bg-yellow-400";
  }

  return (
    <div className="relative group">
      <svg className={`w-4 h-4 ${color} cursor-pointer`} viewBox="0 0 16 16">
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          opacity="0.2"
        />
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={`${filled} ${remaining}`}
          strokeDashoffset={circumference / 4}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50">
        <div className="text-xs text-gray-200 font-medium mb-1">
          Context Window
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${bgColor}`} />
          <span className="text-sm text-white">
            {formatTokens(current)} / {formatTokens(max)}
          </span>
        </div>
        <div className="absolute top-full right-1 border-4 border-transparent border-t-gray-700" />
      </div>
    </div>
  );
}

function getModelDisplayName(model: string | null | undefined): string {
  if (!model || model === "unknown") return "";
  if (model.includes("opus")) return "Opus 4.5";
  if (model.includes("sonnet")) return "Sonnet 4";
  if (model.includes("haiku")) return "Haiku";
  return model;
}

function getSourceBadge(source: SlashCommand["source"]) {
  switch (source) {
    case "builtin":
      return null;
    case "project":
      return (
        <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-blue-500/20 text-blue-400 rounded-sm">
          project
        </span>
      );
    case "user":
      return (
        <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-purple-500/20 text-purple-400 rounded-sm">
          user
        </span>
      );
  }
}

export function MessageInput({
  onSend,
  disabled,
  placeholder = "Ask anything...",
  currentFile,
  currentModel,
  tokenUsage,
  commands = [],
}: MessageInputProps) {
  const [hasContent, setHasContent] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [commandFilter, setCommandFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter commands based on input
  const filteredCommands = commands.filter((cmd) =>
    cmd.name.toLowerCase().includes(commandFilter.toLowerCase())
  );

  // Reset selected index when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [commandFilter]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowCommands(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const updateHasContent = useCallback(() => {
    const value = textareaRef.current?.value || "";
    setHasContent(value.trim().length > 0);

    // Check for slash command trigger
    if (value.startsWith("/")) {
      const filter = value.slice(1).split(" ")[0];
      setCommandFilter(filter);
      setShowCommands(true);
    } else {
      setShowCommands(false);
      setCommandFilter("");
    }
  }, []);

  const insertCommand = useCallback((commandName: string) => {
    if (textareaRef.current) {
      textareaRef.current.value = `/${commandName} `;
      textareaRef.current.focus();
      setShowCommands(false);
      setCommandFilter("");
      setHasContent(true);
    }
  }, []);

  const handleSubmit = () => {
    const value = textareaRef.current?.value || "";
    if (value.trim() && !disabled) {
      onSend(value.trim());
      if (textareaRef.current) {
        textareaRef.current.value = "";
        textareaRef.current.style.height = "auto";
      }
      setHasContent(false);
      setShowCommands(false);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    handleSubmit();
  };

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle command dropdown navigation
    if (showCommands && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        insertCommand(filteredCommands[selectedIndex].name);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowCommands(false);
        return;
      }
    }

    // Normal submit handling
    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
    }
    updateHasContent();
  };

  const handleCommandButtonClick = () => {
    if (textareaRef.current) {
      textareaRef.current.value = "/";
      textareaRef.current.focus();
      setShowCommands(true);
      setCommandFilter("");
      setHasContent(true);
    }
  };

  const getFileName = (path: string) => {
    return path.split("/").pop() || path;
  };

  const modelName = getModelDisplayName(currentModel);

  return (
    <div className="p-2 lg:p-3 border-t border-gray-700 bg-gray-900">
      {/* Keyboard Shortcut Hint */}
      <div className="hidden lg:block text-center text-xs text-gray-500 mb-2">
        ⌘ Esc to focus or unfocus Claude
      </div>

      {/* Main Input Container */}
      <div className="relative bg-gray-800 border border-gray-700 rounded-lg focus-within:border-gray-500 transition-colors">
        {/* Command Autocomplete Dropdown */}
        {showCommands && filteredCommands.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute bottom-full left-0 right-0 mb-1 max-h-64 overflow-y-auto bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50"
          >
            <div className="p-2 text-xs text-gray-400 border-b border-gray-700">
              Slash Commands
            </div>
            {filteredCommands.map((cmd, index) => (
              <button
                key={`${cmd.source}-${cmd.name}`}
                onClick={() => insertCommand(cmd.name)}
                className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${
                  index === selectedIndex
                    ? "bg-gray-700 text-white"
                    : "text-gray-300 hover:bg-gray-700/50"
                }`}
              >
                <span className="font-mono text-orange-400">/{cmd.name}</span>
                <span className="text-sm text-gray-400 truncate flex-1">
                  {cmd.description}
                </span>
                {getSourceBadge(cmd.source)}
              </button>
            ))}
          </div>
        )}

        {/* Input Row */}
        <div className="flex items-end p-2 lg:p-3 gap-2 lg:gap-3">
          <textarea
            ref={textareaRef}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            autoComplete="off"
            autoCorrect="on"
            spellCheck={false}
            className="flex-1 bg-transparent text-white placeholder-gray-500 resize-none outline-hidden text-sm disabled:opacity-50"
            style={{ caretColor: "#d97757" }}
          />

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Attach Button */}
            <button
              type="button"
              className="p-1.5 text-gray-400 hover:text-white transition-colors rounded-sm hover:bg-gray-700"
              title="Attach file"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
            </button>

            {/* Command Button */}
            <button
              type="button"
              onClick={handleCommandButtonClick}
              className={`p-1.5 transition-colors rounded hover:bg-gray-700 font-mono text-sm ${
                showCommands ? "text-orange-400" : "text-gray-400 hover:text-white"
              }`}
              title="Slash commands"
            >
              /
            </button>

            {/* Send Button */}
            <button
              type="button"
              onClick={handleSubmit}
              onTouchEnd={handleTouchEnd}
              disabled={disabled || !hasContent}
              className="p-2 bg-[#d97757] hover:bg-[#c2694d] disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-md transition-all active:scale-95"
              aria-label="Send message"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 10l7-7m0 0l7 7m-7-7v18"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Context Bar */}
        <div className="flex items-center gap-2 lg:gap-3 px-2 lg:px-3 pb-2 text-xs text-gray-500">
          <span className="hover:text-gray-300 cursor-pointer transition-colors">
            » Bypass permissions
          </span>

          {currentFile && (
            <span className="flex items-center gap-1 text-gray-400">
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
              {getFileName(currentFile)}
            </span>
          )}

          <div className="flex-1" />

          {modelName && (
            <span className="text-orange-400 font-medium">{modelName}</span>
          )}

          {tokenUsage && (
            <span className="flex items-center gap-1.5 text-gray-400">
              <ContextPieChart
                percentage={Math.min(
                  100,
                  (tokenUsage.totalTokens / CONTEXT_WINDOW) * 100
                )}
                current={tokenUsage.totalTokens}
                max={CONTEXT_WINDOW}
              />
              {Math.round((tokenUsage.totalTokens / CONTEXT_WINDOW) * 100)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
