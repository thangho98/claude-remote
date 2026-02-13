import { useMemo, useState, useCallback, useEffect } from "react";

interface FileViewerProps {
  path: string;
  content: string;
  onClose: () => void;
}

// Zoom levels (font sizes in pixels)
const ZOOM_LEVELS = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24];
const DEFAULT_ZOOM_INDEX = 2; // 12px

// VS Code-like file icon colors
const FILE_ICON_COLORS: Record<string, string> = {
  ts: "text-blue-400",
  tsx: "text-blue-400",
  js: "text-yellow-400",
  jsx: "text-yellow-400",
  json: "text-orange-400",
  md: "text-blue-300",
  mdx: "text-yellow-300",
  css: "text-blue-300",
  scss: "text-pink-400",
  html: "text-orange-500",
  py: "text-yellow-300",
  rs: "text-orange-400",
  go: "text-cyan-400",
  java: "text-red-400",
  cpp: "text-blue-500",
  c: "text-blue-500",
  h: "text-purple-400",
  cs: "text-green-400",
  php: "text-purple-400",
  rb: "text-red-500",
  swift: "text-orange-400",
  kt: "text-purple-400",
  dart: "text-cyan-400",
  vue: "text-green-400",
  svelte: "text-orange-500",
  yaml: "text-red-400",
  yml: "text-red-400",
  xml: "text-orange-400",
  svg: "text-orange-300",
  sql: "text-gray-300",
  sh: "text-green-300",
  bash: "text-green-300",
  dockerfile: "text-blue-500",
  env: "text-yellow-500",
  gitignore: "text-red-400",
  lock: "text-yellow-500",
  log: "text-gray-400",
};

// Pre-compiled syntax highlighting patterns (hoisted to module level)
const COMPILED_PATTERNS = [
  // Comments
  { regex: /(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$)/gm, class: "text-gray-500 italic" },
  // Strings
  { regex: /(["'`])(?:\\.|(?!\1)[^\\\r\n])*\1/g, class: "text-green-400" },
  // Numbers
  { regex: /\b\d+(?:\.\d+)?\b/g, class: "text-blue-300" },
  // Keywords
  { regex: /\b(?:const|let|var|function|return|if|else|for|while|import|export|from|class|interface|type|enum|async|await|try|catch|throw|new|this|true|false|null|undefined)\b/g, class: "text-purple-400" },
  // Functions
  { regex: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, class: "text-yellow-300" },
  // Types (capitalized)
  { regex: /\b[A-Z][a-zA-Z0-9_$]*\b/g, class: "text-cyan-300" },
];

function getFileIconColor(ext: string): string {
  return FILE_ICON_COLORS[ext.toLowerCase()] || "text-gray-400";
}

function highlightCode(content: string): { lines: string[]; highlighted: (string | JSX.Element)[][] } {
  const lines = content.split("\n");
  const highlighted = lines.map((line, lineIndex) => {
    const tokens: (string | JSX.Element)[] = [];
    let key = 0;

    // Simple tokenization - find all matches and build tokens
    const matches: { start: number; end: number; class: string; text: string }[] = [];

    COMPILED_PATTERNS.forEach(({ regex, class: className }) => {
      regex.lastIndex = 0; // Reset stateful regex before each use
      let match;
      while ((match = regex.exec(line)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          class: className,
          text: match[0],
        });
      }
    });

    // Sort by start position and remove overlaps
    matches.sort((a, b) => a.start - b.start);
    const nonOverlapping: typeof matches = [];
    let lastEnd = -1;
    for (const match of matches) {
      if (match.start >= lastEnd) {
        nonOverlapping.push(match);
        lastEnd = match.end;
      }
    }

    // Build tokens
    let pos = 0;
    for (const match of nonOverlapping) {
      if (match.start > pos) {
        tokens.push(line.slice(pos, match.start));
      }
      tokens.push(
        <span key={`${lineIndex}-${key++}`} className={match.class}>
          {match.text}
        </span>
      );
      pos = match.end;
    }
    if (pos < line.length) {
      tokens.push(line.slice(pos));
    }

    return tokens.length > 0 ? tokens : [line];
  });

  return { lines, highlighted };
}

export function FileViewer({ path, content, onClose }: FileViewerProps) {
  const filename = path.split("/").pop() || path;
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const iconColor = getFileIconColor(ext);

  // Zoom state
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const fontSize = ZOOM_LEVELS[zoomIndex];

  // Zoom handlers
  const zoomIn = useCallback(() => {
    setZoomIndex((prev) => Math.min(prev + 1, ZOOM_LEVELS.length - 1));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const resetZoom = useCallback(() => {
    setZoomIndex(DEFAULT_ZOOM_INDEX);
  }, []);

  // Keyboard shortcuts for zoom (Ctrl/Cmd + +/-)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          zoomIn();
        } else if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          zoomOut();
        } else if (e.key === "0") {
          e.preventDefault();
          resetZoom();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomIn, zoomOut, resetZoom]);

  const { lines, highlighted } = useMemo(() => highlightCode(content), [content]);

  // Calculate line number width
  const lineNumberWidth = Math.max(2, String(lines.length).length);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Tab Header - VS Code style */}
      <div className="flex items-center justify-between bg-[#252526] border-b border-[#1e1e1e]">
        <div className="flex items-center gap-2 px-3 py-2 bg-[#1e1e1e] border-t-2 border-[#d97757] min-w-0">
          {/* File Icon */}
          <svg className={`w-4 h-4 ${iconColor} shrink-0`} fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
              clipRule="evenodd"
            />
          </svg>
          {/* Filename */}
          <span className="text-sm text-gray-300 truncate">
            {filename}
          </span>
          {/* Close button */}
          <button
            onClick={onClose}
            className="p-0.5 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 px-3">
          <button
            onClick={zoomOut}
            disabled={zoomIndex <= 0}
            className="p-1 rounded hover:bg-[#3c3c3c] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Zoom Out (Ctrl -)"
          >
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <span className="text-xs text-gray-400 w-10 text-center font-mono">
            {fontSize}px
          </span>
          <button
            onClick={zoomIn}
            disabled={zoomIndex >= ZOOM_LEVELS.length - 1}
            className="p-1 rounded hover:bg-[#3c3c3c] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Zoom In (Ctrl +)"
          >
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={resetZoom}
            className="p-1 rounded hover:bg-[#3c3c3c] transition-all ml-1"
            title="Reset Zoom (Ctrl 0)"
          >
            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-4 py-1 text-xs text-gray-500 bg-[#1e1e1e] border-b border-[#2d2d2d]">
        {path.split("/").map((part, i, arr) => (
          <span key={i} className="flex items-center">
            <span className="hover:text-gray-300 cursor-pointer">{part}</span>
            {i < arr.length - 1 && (
              <svg className="w-3 h-3 mx-1 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </span>
        ))}
      </div>

      {/* Code Editor Area */}
      <div className="flex-1 overflow-auto font-mono" style={{ fontSize: `${fontSize}px`, lineHeight: '1.5' }}>
        <div className="flex min-h-full">
          {/* Line Numbers */}
          <div className="select-none bg-[#1e1e1e] border-r border-[#2d2d2d] text-right py-4">
            {lines.map((_, i) => (
              <div
                key={i}
                className="px-3 text-gray-600"
                style={{ minWidth: `${lineNumberWidth + 1}ch`, lineHeight: '1.5' }}
              >
                {i + 1}
              </div>
            ))}
          </div>

          {/* Code Content */}
          <div className="flex-1 py-4 overflow-x-auto">
            {highlighted.map((tokens, i) => (
              <div key={i} className="px-4 whitespace-pre" style={{ lineHeight: '1.5' }}>
                {tokens.length > 0 ? tokens : "\u00A0"}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-3 py-1 text-xs bg-[#d97757] text-white">
        <div className="flex items-center gap-4">
          <span>{ext.toUpperCase() || "TEXT"}</span>
          <span>{lines.length} lines</span>
          <span>{content.length} chars</span>
        </div>
        <div className="flex items-center gap-4">
          <span>UTF-8</span>
          <span>LF</span>
        </div>
      </div>
    </div>
  );
}
