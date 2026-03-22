import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import type { TokenUsage, SlashCommand, SettingsProfile } from "@shared/types";

interface ModelInfo {
  value: string;
  displayName: string;
  description: string;
}

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
  currentFile?: string | null;
  tokenUsage?: TokenUsage | null;
  commands?: SlashCommand[];
  models?: ModelInfo[];
  currentModel?: string;
  onModelChange?: (model: string) => void;
  profiles?: SettingsProfile[];
  currentProfile?: SettingsProfile | null;
  onProfileChange?: (profile: SettingsProfile) => void;
}

type PermissionMode = "ask" | "auto" | "plan" | "bypass";
type EffortLevel = "low" | "medium" | "high" | "max";
const EFFORT_LEVELS: { id: EffortLevel; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "max", label: "Max" },
];

const MODES: { id: PermissionMode; label: string; icon: string; desc: string }[] = [
  { id: "ask", label: "Ask before edits", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", desc: "Claude will ask for approval before making each edit" },
  { id: "auto", label: "Edit automatically", icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4", desc: "Claude will edit your selected text or the whole file" },
  { id: "plan", label: "Plan mode", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2", desc: "Claude will explore the code and present a plan before editing" },
  { id: "bypass", label: "Bypass permissions", icon: "M13 10V3L4 14h7v7l9-11h-7z", desc: "Claude will not ask for approval before running potentially dangerous commands" },
];

function formatTokens(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

const CONTEXT_WINDOW = 150000;

const ContextPieChart = memo(function ContextPieChart({
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

  let color = "#22c55e";
  if (percentage > 70) color = "#ef4444";
  else if (percentage > 40) color = "#eab308";

  return (
    <div className="relative group">
      <svg className="w-4 h-4 cursor-pointer" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r={radius} fill="none" stroke={color} strokeWidth="3" opacity="0.2" />
        <circle cx="8" cy="8" r={radius} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${filled} ${remaining}`} strokeDashoffset={circumference / 4} strokeLinecap="round" />
      </svg>
      <div className="absolute bottom-full right-0 mb-2 px-3 py-2 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50"
        style={{ background: 'var(--bg-tertiary)' }}>
        <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Context Window</div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            {formatTokens(current)} / {formatTokens(max)}
          </span>
        </div>
      </div>
    </div>
  );
});

function getKindBadge(kind: SlashCommand["kind"]) {
  switch (kind) {
    case "builtin": return <span className="shrink-0 px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/15 text-emerald-400">built-in</span>;
    case "command": return <span className="shrink-0 px-1.5 py-0.5 text-[10px] rounded bg-blue-500/15 text-blue-400">command</span>;
    case "skill": return <span className="shrink-0 px-1.5 py-0.5 text-[10px] rounded bg-purple-500/15 text-purple-400">skill</span>;
  }
}

interface ModesListProps {
  permissionMode: PermissionMode;
  onSelect: (id: PermissionMode) => void;
  effortLevel: EffortLevel;
  onEffortChange: (level: EffortLevel) => void;
  showShortcut: boolean;
}

function ModesList({ permissionMode, onSelect, effortLevel, onEffortChange, showShortcut }: ModesListProps) {
  return (
    <>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-primary)' }}>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Modes</span>
        {showShortcut && (
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <kbd className="px-1 py-0.5 rounded text-[10px]" style={{ background: 'var(--bg-tertiary)' }}>⌘</kbd>
            {' + '}
            <kbd className="px-1 py-0.5 rounded text-[10px]" style={{ background: 'var(--bg-tertiary)' }}>tab</kbd>
            {' to switch'}
          </span>
        )}
      </div>
      {MODES.map((mode) => (
        <button key={mode.id}
          onClick={() => onSelect(mode.id)}
          className="w-full px-4 py-3 flex items-start gap-3 text-left transition-colors active:scale-[0.98]"
          style={{ background: permissionMode === mode.id ? 'var(--accent-light)' : 'transparent' }}>
          <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
            style={{ color: permissionMode === mode.id ? 'var(--accent)' : 'var(--text-muted)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mode.icon} />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{mode.label}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{mode.desc}</div>
          </div>
          {permissionMode === mode.id && (
            <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
              style={{ color: 'var(--accent)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
      ))}

      {/* Effort Level */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-primary)' }}>
        <div className="flex items-center gap-3 mb-2.5">
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
            style={{ color: 'var(--text-muted)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M9.172 15.828a4 4 0 010-5.656m5.656 0a4 4 0 010 5.656M12 12h.008v.008H12V12z" />
          </svg>
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Effort</span>
        </div>
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-primary)' }}>
          {EFFORT_LEVELS.map((level) => (
            <button key={level.id}
              onClick={(e) => { e.stopPropagation(); onEffortChange(level.id); }}
              className="flex-1 py-2 text-xs font-medium transition-all active:scale-95"
              style={{
                background: effortLevel === level.id ? 'var(--accent)' : 'transparent',
                color: effortLevel === level.id ? 'white' : 'var(--text-muted)',
              }}>
              {level.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export function MessageInput({
  onSend,
  disabled,
  placeholder,
  currentFile,
  tokenUsage,
  commands = [],
  models = [],
  currentModel,
  onModelChange,
  profiles = [],
  currentProfile,
  onProfileChange,
}: MessageInputProps) {
  const [hasContent, setHasContent] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [showModes, setShowModes] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("bypass");
  const [effortLevel, setEffortLevel] = useState<EffortLevel>("max");
  const [commandFilter, setCommandFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modesRef = useRef<HTMLDivElement>(null);
  const modesSheetRef = useRef<HTMLDivElement>(null);

  const currentMode = MODES.find((m) => m.id === permissionMode)!;

  const filteredCommands = useMemo(() =>
    commands.filter((cmd) => cmd.name.toLowerCase().includes(commandFilter.toLowerCase())),
    [commands, commandFilter]
  );

  useEffect(() => { setSelectedIndex(0); }, [commandFilter]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowCommands(false);
      if (modesRef.current && !modesRef.current.contains(e.target as Node) &&
          (!modesSheetRef.current || !modesSheetRef.current.contains(e.target as Node))) setShowModes(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const updateHasContent = useCallback(() => {
    const value = textareaRef.current?.value || "";
    setHasContent(value.trim().length > 0);
    if (value.startsWith("/")) {
      setCommandFilter(value.slice(1).split(" ")[0]);
      setShowCommands(true);
    } else {
      setShowCommands(false);
      setCommandFilter("");
    }
  }, []);

  const insertCommand = useCallback((commandName: string) => {
    // Intercept UI-handled commands
    const lower = commandName.toLowerCase();
    if (lower === 'model' || lower === 'models') {
      if (textareaRef.current) { textareaRef.current.value = ""; textareaRef.current.style.height = "auto"; }
      setShowCommands(false);
      setCommandFilter("");
      setHasContent(false);
      setShowModelPicker(true);
      return;
    }

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
    if (!value.trim() || disabled) return;

    // Intercept built-in UI commands
    const trimmed = value.trim().toLowerCase();
    if (trimmed === '/model' || trimmed === '/models') {
      if (textareaRef.current) { textareaRef.current.value = ""; textareaRef.current.style.height = "auto"; }
      setHasContent(false);
      setShowCommands(false);
      setShowModelPicker(true);
      return;
    }

    onSend(value.trim());
    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = "auto";
    }
    setHasContent(false);
    setShowCommands(false);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    handleSubmit();
  };

  const isMobile = useMemo(() => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent), []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showCommands && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((p) => p < filteredCommands.length - 1 ? p + 1 : 0); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((p) => p > 0 ? p - 1 : filteredCommands.length - 1); return; }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); insertCommand(filteredCommands[selectedIndex].name); return; }
      if (e.key === "Escape") { e.preventDefault(); setShowCommands(false); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !isMobile) { e.preventDefault(); handleSubmit(); }
  }, [showCommands, filteredCommands.length, selectedIndex, isMobile]);

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
    updateHasContent();
  }, [updateHasContent]);

  const handleCommandButtonClick = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.value = "/";
      textareaRef.current.focus();
      setShowCommands(true);
      setCommandFilter("");
      setHasContent(true);
    }
  }, []);

  const getFileName = useCallback((path: string) => path.split("/").pop() || path, []);

  const defaultPlaceholder = placeholder || (isMobile ? "Ask anything..." : "Esc to focus or unfocus Claude");

  return (
    <div className="relative p-2 pb-4 lg:p-3" style={{ background: 'var(--bg-primary)' }}>
      {/* Command Autocomplete Dropdown — outside overflow-hidden container */}
      {showCommands && filteredCommands.length > 0 && (
        <div ref={dropdownRef}
          className="absolute bottom-full left-2 right-2 lg:left-3 lg:right-3 mb-1 max-h-64 overflow-y-auto rounded-lg shadow-xl z-50"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
          <div className="p-2 text-xs" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-primary)' }}>
            Slash Commands
          </div>
          {filteredCommands.map((cmd, index) => (
            <button key={`${cmd.source}-${cmd.name}`} onClick={() => insertCommand(cmd.name)}
              className="w-full px-3 py-2.5 flex items-start gap-3 text-left transition-colors"
              style={index === selectedIndex ? { background: 'var(--bg-tertiary)' } : {}}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-sm" style={{ color: 'var(--accent)' }}>/{cmd.name}</span>
                  {getKindBadge(cmd.kind)}
                  {cmd.source !== 'builtin' && (
                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/15 text-amber-400">
                      {cmd.source}
                    </span>
                  )}
                </div>
                <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{cmd.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Main Input Container */}
      <div className="relative rounded-xl overflow-hidden" style={{ border: '1.5px solid var(--accent)', background: 'var(--bg-secondary)' }}>

        {/* Textarea */}
        <div className="px-3 pt-3 pb-2">
          <textarea
            ref={textareaRef}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={defaultPlaceholder}
            disabled={disabled}
            rows={2}
            autoComplete="off"
            autoCorrect="on"
            spellCheck={false}
            className="w-full bg-transparent resize-none outline-hidden text-sm disabled:opacity-50 placeholder:italic"
            style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-2 pb-2">
          {/* Add context (+) */}
          <button type="button"
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title="Add context">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* Slash commands (/) */}
          <button type="button" onClick={handleCommandButtonClick}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: showCommands ? 'var(--accent)' : 'var(--text-muted)' }}
            title="Slash commands">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </button>

          {/* Current file chip */}
          {currentFile && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {getFileName(currentFile)}
            </div>
          )}

          {/* Profile selector */}
          {profiles.length > 1 && (
            <div className="flex items-center gap-1 rounded-md text-xs"
              style={{ background: 'var(--bg-tertiary)' }}>
              <svg className="w-3 h-3 ml-1.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                style={{ color: 'var(--text-muted)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <select
                value={currentProfile?.path || ''}
                onChange={(e) => {
                  const profile = profiles.find(p => p.path === e.target.value);
                  if (profile && onProfileChange) onProfileChange(profile);
                }}
                className="py-0.5 pr-1 bg-transparent border-none outline-none cursor-pointer text-xs"
                style={{ color: 'var(--text-secondary)' }}
                title="Settings profile"
              >
                {profiles.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.name}{p.provider && p.provider !== 'Anthropic' ? ` · ${p.provider}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Context usage */}
          {tokenUsage && (
            <ContextPieChart
              percentage={Math.min(100, (tokenUsage.totalTokens / CONTEXT_WINDOW) * 100)}
              current={tokenUsage.totalTokens}
              max={CONTEXT_WINDOW}
            />
          )}

          {/* Mode selector */}
          <div className="relative" ref={modesRef}>
            <button type="button"
              onClick={() => setShowModes(!showModes)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors"
              style={{ color: 'var(--text-muted)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <span className="hidden sm:inline">{currentMode.label}</span>
            </button>

            {/* Desktop: dropdown */}
            {showModes && (
              <div className="hidden lg:block absolute bottom-full right-0 mb-2 w-72 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                <ModesList permissionMode={permissionMode} onSelect={(id) => { setPermissionMode(id); setShowModes(false); }} effortLevel={effortLevel} onEffortChange={setEffortLevel} showShortcut />
              </div>
            )}
          </div>

          {/* Mobile: bottom sheet (portal to body) */}
          {showModes && (
            <div ref={modesSheetRef} className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end animate-fade-in"
              onClick={() => setShowModes(false)}>
              {/* Backdrop */}
              <div className="absolute inset-0" style={{ background: 'var(--bg-overlay)' }} />
              {/* Sheet */}
              <div className="relative rounded-t-2xl pb-safe animate-slide-up"
                style={{ background: 'var(--bg-secondary)' }}
                onClick={(e) => e.stopPropagation()}>
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-secondary)' }} />
                </div>
                <ModesList permissionMode={permissionMode} onSelect={(id) => { setPermissionMode(id); setShowModes(false); }} effortLevel={effortLevel} onEffortChange={setEffortLevel} showShortcut={false} />
                {/* Cancel button */}
                <div className="px-4 pb-4 pt-2">
                  <button onClick={() => setShowModes(false)}
                    className="w-full py-3 rounded-xl text-sm font-medium"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Send button */}
          <button type="button"
            onClick={handleSubmit}
            onTouchEnd={handleTouchEnd}
            disabled={disabled || !hasContent}
            className="p-1.5 rounded-lg disabled:cursor-not-allowed transition-all active:scale-95"
            style={{
              background: disabled || !hasContent ? 'var(--bg-tertiary)' : 'var(--accent)',
              color: disabled || !hasContent ? 'var(--text-muted)' : 'white',
            }}
            aria-label="Send message">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Model Picker Bottom Sheet */}
      {showModelPicker && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end animate-fade-in"
          onClick={() => setShowModelPicker(false)}>
          <div className="absolute inset-0" style={{ background: 'var(--bg-overlay)' }} />
          <div className="relative rounded-t-2xl pb-safe animate-slide-up"
            style={{ background: 'var(--bg-secondary)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-secondary)' }} />
            </div>
            <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--border-primary)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Select Model</span>
            </div>
            {models.length > 0 ? models.map((m) => {
              const isActive = currentModel?.includes(m.value) ||
                (m.value === 'default' && !models.some(x => x.value !== 'default' && currentModel?.includes(x.value)));
              return (
                <button key={m.value}
                  onClick={() => { onModelChange?.(m.value); setShowModelPicker(false); }}
                  className="w-full px-4 py-3.5 flex items-start gap-3 text-left transition-colors active:scale-[0.98]"
                  style={{ background: isActive ? 'var(--accent-light)' : 'transparent' }}>
                  <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.displayName}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{m.description}</div>
                  </div>
                  {isActive && (
                    <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      style={{ color: 'var(--accent)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            }) : (
              <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                No models available. Send a message first to load models.
              </div>
            )}
            <div className="px-4 pb-4 pt-2">
              <button onClick={() => setShowModelPicker(false)}
                className="w-full py-3 rounded-xl text-sm font-medium"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
