import { useState, useRef, useCallback, useMemo } from "react";
import type { GitDiffResult, GitDiffHunk, GitDiffLine } from "@shared/types";

interface DiffViewerProps {
  diff: GitDiffResult;
  onClose: () => void;
}

export function DiffViewer({ diff, onClose }: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<"unified" | "split">("unified");
  const filename = diff.path.split("/").pop() || diff.path;
  const ext = filename.split(".").pop()?.toUpperCase() || "TEXT";

  // Compute totals
  const { totalAdditions, totalDeletions } = useMemo(() => {
    let add = 0;
    let del = 0;
    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.type === "add") add++;
        else if (line.type === "remove") del++;
      }
    }
    return { totalAdditions: add, totalDeletions: del };
  }, [diff.hunks]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Tab Header */}
      <div className="flex items-center justify-between bg-[#252526] border-b border-[#1e1e1e]">
        <div className="flex items-center gap-2 px-3 py-2 bg-[#1e1e1e] border-t-2 border-[#d97757] min-w-0">
          <svg className="w-4 h-4 text-yellow-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
          </svg>
          <span className="text-sm text-gray-300 truncate">{filename}</span>
          <span className="text-xs text-gray-500">(diff)</span>
          <button onClick={onClose} className="p-0.5 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 px-3">
          <button
            onClick={() => setViewMode("unified")}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              viewMode === "unified" ? "bg-[#3c3c3c] text-gray-200" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Unified
          </button>
          <button
            onClick={() => setViewMode("split")}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              viewMode === "split" ? "bg-[#3c3c3c] text-gray-200" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Split
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-4 py-1 text-xs text-gray-500 bg-[#1e1e1e] border-b border-[#2d2d2d]">
        {diff.path.split("/").map((part, i, arr) => (
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

      {/* Diff Content */}
      <div className="flex-1 overflow-auto font-mono text-xs leading-[1.6]">
        {diff.isBinary ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            <p>Binary file changed - cannot display diff</p>
          </div>
        ) : diff.hunks.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            <p>No changes to display</p>
          </div>
        ) : viewMode === "unified" ? (
          <UnifiedView hunks={diff.hunks} />
        ) : (
          <SplitView hunks={diff.hunks} />
        )}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-3 py-1 text-xs bg-[#d97757] text-white shrink-0">
        <div className="flex items-center gap-4">
          <span>{ext}</span>
          <span>{diff.hunks.length} {diff.hunks.length === 1 ? "hunk" : "hunks"}</span>
          <span className="flex gap-2">
            <span>+{totalAdditions}</span>
            <span>-{totalDeletions}</span>
          </span>
        </div>
        <span>{viewMode === "unified" ? "Unified" : "Side-by-Side"}</span>
      </div>
    </div>
  );
}

// --- Unified View ---

function UnifiedView({ hunks }: { hunks: GitDiffHunk[] }) {
  return (
    <div className="min-h-full">
      {hunks.map((hunk, hi) => (
        <div
          key={hi}
          style={{ contentVisibility: "auto", containIntrinsicSize: `auto ${hunk.lines.length * 1.6}em` }}
        >
          {/* Hunk header */}
          <div className="px-4 py-1 bg-blue-900/10 text-blue-400 sticky top-0 border-y border-[#2d2d2d]">
            {hunk.header}
          </div>
          {/* Lines */}
          {hunk.lines.map((line, li) => (
            <UnifiedLine key={`${hi}-${li}`} line={line} />
          ))}
        </div>
      ))}
    </div>
  );
}

function UnifiedLine({ line }: { line: GitDiffLine }) {
  const bgClass =
    line.type === "add" ? "bg-green-900/15" :
    line.type === "remove" ? "bg-red-900/15" : "";

  const textClass =
    line.type === "add" ? "text-green-400" :
    line.type === "remove" ? "text-red-400" : "text-gray-300";

  const prefix =
    line.type === "add" ? "+" :
    line.type === "remove" ? "-" : " ";

  return (
    <div className={`flex ${bgClass} hover:brightness-125`}>
      {/* Old line number */}
      <span className="w-12 text-right pr-2 text-gray-600 select-none shrink-0 border-r border-[#2d2d2d]">
        {line.oldLineNumber ?? ""}
      </span>
      {/* New line number */}
      <span className="w-12 text-right pr-2 text-gray-600 select-none shrink-0 border-r border-[#2d2d2d]">
        {line.newLineNumber ?? ""}
      </span>
      {/* Prefix + content */}
      <span className={`pl-2 whitespace-pre ${textClass}`}>
        <span className="select-none">{prefix}</span>
        {line.content}
      </span>
    </div>
  );
}

// --- Split View ---

function SplitView({ hunks }: { hunks: GitDiffHunk[] }) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const handleLeftScroll = useCallback(() => {
    if (syncing.current) return;
    syncing.current = true;
    if (leftRef.current && rightRef.current) {
      rightRef.current.scrollTop = leftRef.current.scrollTop;
    }
    syncing.current = false;
  }, []);

  const handleRightScroll = useCallback(() => {
    if (syncing.current) return;
    syncing.current = true;
    if (leftRef.current && rightRef.current) {
      leftRef.current.scrollTop = rightRef.current.scrollTop;
    }
    syncing.current = false;
  }, []);

  // Build aligned rows grouped by hunk for content-visibility
  const hunkGroups = useMemo(() => {
    const rows = buildSplitRows(hunks);
    const groups: SplitRow[][] = [];
    let current: SplitRow[] = [];
    for (const row of rows) {
      if (row.isHunkHeader && current.length > 0) {
        groups.push(current);
        current = [];
      }
      current.push(row);
    }
    if (current.length > 0) groups.push(current);
    return groups;
  }, [hunks]);

  return (
    <div className="flex h-full">
      {/* Left (old) */}
      <div ref={leftRef} onScroll={handleLeftScroll} className="flex-1 overflow-auto border-r border-[#2d2d2d]">
        {hunkGroups.map((group, gi) => (
          <div key={gi} style={{ contentVisibility: "auto", containIntrinsicSize: `auto ${group.length * 1.6}em` }}>
            {group.map((row, i) => (
              <SplitLine key={i} line={row.left} side="old" isHunkHeader={row.isHunkHeader} headerText={row.headerText} />
            ))}
          </div>
        ))}
      </div>
      {/* Right (new) */}
      <div ref={rightRef} onScroll={handleRightScroll} className="flex-1 overflow-auto">
        {hunkGroups.map((group, gi) => (
          <div key={gi} style={{ contentVisibility: "auto", containIntrinsicSize: `auto ${group.length * 1.6}em` }}>
            {group.map((row, i) => (
              <SplitLine key={i} line={row.right} side="new" isHunkHeader={row.isHunkHeader} headerText={row.headerText} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface SplitRow {
  left: GitDiffLine | null;
  right: GitDiffLine | null;
  isHunkHeader?: boolean;
  headerText?: string;
}

function buildSplitRows(hunks: GitDiffHunk[]): SplitRow[] {
  const rows: SplitRow[] = [];

  for (const hunk of hunks) {
    rows.push({ left: null, right: null, isHunkHeader: true, headerText: hunk.header });

    let i = 0;
    while (i < hunk.lines.length) {
      const line = hunk.lines[i];

      if (line.type === "context") {
        rows.push({ left: line, right: line });
        i++;
      } else if (line.type === "remove") {
        // Collect consecutive removes
        const removes: GitDiffLine[] = [];
        while (i < hunk.lines.length && hunk.lines[i].type === "remove") {
          removes.push(hunk.lines[i]);
          i++;
        }
        // Collect consecutive adds
        const adds: GitDiffLine[] = [];
        while (i < hunk.lines.length && hunk.lines[i].type === "add") {
          adds.push(hunk.lines[i]);
          i++;
        }
        // Pair them up
        const maxLen = Math.max(removes.length, adds.length);
        for (let j = 0; j < maxLen; j++) {
          rows.push({
            left: j < removes.length ? removes[j] : null,
            right: j < adds.length ? adds[j] : null,
          });
        }
      } else if (line.type === "add") {
        rows.push({ left: null, right: line });
        i++;
      }
    }
  }

  return rows;
}

function SplitLine({
  line,
  side,
  isHunkHeader,
  headerText,
}: {
  line: GitDiffLine | null;
  side: "old" | "new";
  isHunkHeader?: boolean;
  headerText?: string;
}) {
  if (isHunkHeader) {
    return (
      <div className="px-2 py-1 bg-blue-900/10 text-blue-400 border-y border-[#2d2d2d] truncate">
        {headerText}
      </div>
    );
  }

  if (!line) {
    return <div className="bg-gray-800/30 min-h-[1.6em]">&nbsp;</div>;
  }

  const lineNum = side === "old" ? line.oldLineNumber : line.newLineNumber;

  const bgClass =
    line.type === "add" ? "bg-green-900/15" :
    line.type === "remove" ? "bg-red-900/15" : "";

  const textClass =
    line.type === "add" ? "text-green-400" :
    line.type === "remove" ? "text-red-400" : "text-gray-300";

  return (
    <div className={`flex ${bgClass} hover:brightness-125`}>
      <span className="w-10 text-right pr-2 text-gray-600 select-none shrink-0 border-r border-[#2d2d2d]">
        {lineNum ?? ""}
      </span>
      <span className={`pl-2 whitespace-pre ${textClass}`}>{line.content}</span>
    </div>
  );
}
