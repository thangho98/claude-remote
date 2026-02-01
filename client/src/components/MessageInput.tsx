import { useState, useRef, useEffect } from "react";
import type { TokenUsage } from "@shared/types";

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
  currentFile?: string | null;
  currentModel?: string | null;
  tokenUsage?: TokenUsage | null;
}

function formatTokens(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

// Claude Code uses ~150K effective context to leave room for output generation
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
  // SVG pie chart using stroke-dasharray technique
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const filled = (percentage / 100) * circumference;
  const remaining = circumference - filled;

  // Color based on usage
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
        {/* Background circle */}
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          opacity="0.2"
        />
        {/* Filled arc */}
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
      {/* Popover */}
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
        {/* Arrow */}
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

export function MessageInput({
  onSend,
  disabled,
  placeholder = "Ask anything...",
  currentFile,
  currentModel,
  tokenUsage,
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (content.trim() && !disabled) {
      console.log("📤 Sending message:", content.trim().slice(0, 50));
      onSend(content.trim());
      setContent("");
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
    }
  }, [content]);

  // Get filename from path
  const getFileName = (path: string) => {
    return path.split("/").pop() || path;
  };

  const modelName = getModelDisplayName(currentModel);

  return (
    <div className="p-2 lg:p-3 border-t border-gray-700 bg-gray-900">
      {/* Keyboard Shortcut Hint - only on desktop */}
      <div className="hidden lg:block text-center text-xs text-gray-500 mb-2">
        ⌘ Esc to focus or unfocus Claude
      </div>

      {/* Main Input Container */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg focus-within:border-gray-500 transition-colors">
        {/* Input Row */}
        <div className="flex items-end p-2 lg:p-3 gap-2 lg:gap-3">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent text-white placeholder-gray-500 resize-none outline-none text-sm disabled:opacity-50"
          />

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Attach Button */}
            <button
              type="button"
              className="p-1.5 text-gray-400 hover:text-white transition-colors rounded hover:bg-gray-700"
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
              className="p-1.5 text-gray-400 hover:text-white transition-colors rounded hover:bg-gray-700 font-mono text-sm"
              title="Commands"
            >
              /
            </button>

            {/* Send Button */}
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={disabled || !content.trim()}
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
          {/* Bypass Permissions */}
          <span className="hover:text-gray-300 cursor-pointer transition-colors">
            » Bypass permissions
          </span>

          {/* Current File */}
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

          {/* Spacer */}
          <div className="flex-1" />

          {/* Model */}
          {modelName && (
            <span className="text-orange-400 font-medium">{modelName}</span>
          )}

          {/* Token Usage with Pie Chart */}
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
