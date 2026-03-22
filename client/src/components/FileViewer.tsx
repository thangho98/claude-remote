import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { githubLight } from "@uiw/codemirror-theme-github";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { useTheme } from "../hooks/useTheme";

// Language imports
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { rust } from "@codemirror/lang-rust";
import { go } from "@codemirror/lang-go";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { php } from "@codemirror/lang-php";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";

interface FileViewerProps {
  path: string;
  content: string;
  onClose: () => void;
  onSave?: (path: string, content: string) => void;
}

// Zoom levels (font sizes in pixels)
const ZOOM_LEVELS = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24];
const DEFAULT_ZOOM_INDEX = 2; // 12px

// VS Code-like file icon colors
const FILE_ICON_COLORS: Record<string, string> = {
  ts: "text-blue-400", tsx: "text-blue-400",
  js: "text-yellow-400", jsx: "text-yellow-400",
  json: "text-orange-400", md: "text-blue-300", mdx: "text-yellow-300",
  css: "text-blue-300", scss: "text-pink-400", html: "text-orange-500",
  py: "text-yellow-300", rs: "text-orange-400", go: "text-cyan-400",
  java: "text-red-400", cpp: "text-blue-500", c: "text-blue-500",
  h: "text-purple-400", cs: "text-green-400", php: "text-purple-400",
  rb: "text-red-500", swift: "text-orange-400", kt: "text-purple-400",
  dart: "text-cyan-400", vue: "text-green-400", svelte: "text-orange-500",
  yaml: "text-red-400", yml: "text-red-400", xml: "text-orange-400",
  svg: "text-orange-300", sql: "text-gray-300", sh: "text-green-300",
  bash: "text-green-300", dockerfile: "text-blue-500", env: "text-yellow-500",
  gitignore: "text-red-400", lock: "text-yellow-500", log: "text-gray-400",
};

// Map file extensions to CodeMirror language support
function getLanguageExtension(ext: string) {
  switch (ext.toLowerCase()) {
    case "ts": return javascript({ typescript: true });
    case "tsx": return javascript({ typescript: true, jsx: true });
    case "js": case "mjs": case "cjs": return javascript();
    case "jsx": return javascript({ jsx: true });
    case "json": return json();
    case "html": case "htm": return html();
    case "css": case "scss": case "less": return css();
    case "py": return python();
    case "md": case "mdx": return markdown();
    case "rs": return rust();
    case "go": return go();
    case "java": case "kt": case "scala": return java();
    case "cpp": case "c": case "h": case "hpp": case "cc": case "cxx": return cpp();
    case "php": return php();
    case "sql": return sql();
    case "xml": case "svg": case "plist": return xml();
    case "yaml": case "yml": return yaml();
    default: return null;
  }
}

// Custom styles to integrate CM6 into our chrome
const cmThemeOverride = EditorView.theme({
  "&": {
    height: "100%",
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  },
  // Mobile touch: make content easier to tap
  ".cm-content": {
    padding: "16px 0",
  },
  ".cm-line": {
    padding: "0 16px",
  },
});

export function FileViewer({ path, content, onClose, onSave }: FileViewerProps) {
  const filename = path.split("/").pop() || path;
  const ext = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() || "" : filename.toLowerCase();
  const iconColor = FILE_ICON_COLORS[ext] || "text-gray-400";

  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const { isDark } = useTheme();

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);
  const [hasChanges, setHasChanges] = useState(false);

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

  // Keyboard shortcuts for zoom
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

  // Reset edited content when file changes
  useEffect(() => {
    setEditedContent(content);
    setHasChanges(false);
  }, [content, path]);

  // CodeMirror extensions
  const extensions = useMemo(() => {
    const exts = [cmThemeOverride];
    const lang = getLanguageExtension(ext);
    if (lang) exts.push(lang);
    if (!isEditing) {
      exts.push(EditorState.readOnly.of(true));
      exts.push(EditorView.editable.of(false));
    }
    // Word wrap for mobile
    exts.push(EditorView.lineWrapping);
    return exts;
  }, [ext, isEditing]);

  // Font size extension (separate so it updates independently)
  const fontSizeExt = useMemo(
    () => EditorView.theme({ ".cm-scroller": { fontSize: `${fontSize}px` } }),
    [fontSize]
  );

  const handleChange = useCallback((value: string) => {
    setEditedContent(value);
    setHasChanges(value !== content);
  }, [content]);

  const handleToggleEdit = useCallback(() => {
    if (isEditing && hasChanges) {
      // Switching from edit to view with unsaved changes
      if (confirm("Bạn có thay đổi chưa lưu. Bỏ thay đổi?")) {
        setEditedContent(content);
        setHasChanges(false);
        setIsEditing(false);
      }
    } else {
      setIsEditing(!isEditing);
    }
  }, [isEditing, hasChanges, content]);

  const handleSave = useCallback(() => {
    if (onSave && hasChanges) {
      onSave(path, editedContent);
      setHasChanges(false);
      setIsEditing(false);
    }
  }, [onSave, path, editedContent, hasChanges]);

  const lineCount = useMemo(() => editedContent.split("\n").length, [editedContent]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--editor-bg)' }}>
      {/* Tab Header - VS Code style */}
      <div className="flex items-center justify-between" style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-primary)' }}>
        <div className="flex items-center gap-2 px-3 py-2 min-w-0" style={{ background: 'var(--editor-bg)', borderTop: '2px solid var(--accent)' }}>
          {/* File Icon */}
          <svg className={`w-4 h-4 ${iconColor} shrink-0`} fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
              clipRule="evenodd"
            />
          </svg>
          {/* Filename + modified indicator */}
          <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
            {filename}{hasChanges && " •"}
          </span>
          {/* Close button */}
          <button
            onClick={onClose}
            className="p-0.5 rounded shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-1 px-3">
          {/* Edit/View Toggle */}
          <button
            onClick={handleToggleEdit}
            className="px-2 py-1 rounded text-xs font-medium transition-all"
            style={{
              background: isEditing ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: isEditing ? 'white' : 'var(--text-muted)',
            }}
            title={isEditing ? "Switch to View mode" : "Switch to Edit mode"}
          >
            {isEditing ? "Editing" : "Edit"}
          </button>

          {/* Save button (only when editing with changes) */}
          {isEditing && hasChanges && onSave && (
            <button
              onClick={handleSave}
              className="px-2 py-1 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-500 transition-all"
              title="Save changes"
            >
              Save
            </button>
          )}

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 ml-2">
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
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-4 py-1 text-xs" style={{ color: 'var(--text-muted)', background: 'var(--editor-bg)', borderBottom: '1px solid var(--border-primary)' }}>
        {path.split("/").map((part, i, arr) => (
          <span key={i} className="flex items-center">
            <span className="hover:text-gray-300 cursor-pointer">{part}</span>
            {i < arr.length - 1 && (
              <svg className="w-3 h-3 mx-1" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </span>
        ))}
      </div>

      {/* CodeMirror Editor */}
      <div className="flex-1 overflow-hidden">
        <CodeMirror
          ref={cmRef}
          value={editedContent}
          onChange={handleChange}
          theme={isDark ? vscodeDark : githubLight}
          extensions={[...extensions, fontSizeExt]}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: isEditing,
            highlightActiveLine: isEditing,
            foldGutter: true,
            bracketMatching: true,
            closeBrackets: isEditing,
            autocompletion: false,
            indentOnInput: isEditing,
            searchKeymap: true,
          }}
          height="100%"
          className="h-full"
        />
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-3 py-1 text-xs text-white" style={{ background: 'var(--accent)' }}>
        <div className="flex items-center gap-4">
          <span>{isEditing ? "EDITING" : "READ ONLY"}</span>
          <span>{ext.toUpperCase() || "TEXT"}</span>
          <span>{lineCount} lines</span>
          <span>{editedContent.length} chars</span>
        </div>
        <div className="flex items-center gap-4">
          <span>UTF-8</span>
          <span>LF</span>
        </div>
      </div>
    </div>
  );
}
