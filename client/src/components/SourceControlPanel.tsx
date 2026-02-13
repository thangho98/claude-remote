import { memo } from "react";
import type { GitStatusInfo, GitChange, GitFileStatus } from "@shared/types";

interface SourceControlPanelProps {
  gitStatus: GitStatusInfo | null;
  gitChanges: GitChange[];
  onDiffSelect: (path: string) => void;
  onRefresh: () => void;
  selectedDiffPath?: string;
}

const STATUS_CONFIG = new Map<GitFileStatus, { label: string; color: string }>([
  ["modified", { label: "M", color: "text-yellow-400" }],
  ["added", { label: "A", color: "text-green-400" }],
  ["deleted", { label: "D", color: "text-red-400" }],
  ["renamed", { label: "R", color: "text-blue-400" }],
  ["untracked", { label: "U", color: "text-green-300" }],
  ["conflicted", { label: "!", color: "text-orange-500" }],
]);

export const SourceControlPanel = memo(function SourceControlPanel({
  gitStatus,
  gitChanges,
  onDiffSelect,
  onRefresh,
  selectedDiffPath,
}: SourceControlPanelProps) {
  // Loading state
  if (gitStatus === null) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        Loading git status...
      </div>
    );
  }

  // Not a git repo
  if (!gitStatus.isGitRepo) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        <div className="text-center">
          <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <p>Not a git repository</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800/50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Branch icon */}
          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <span className="text-gray-300 truncate font-medium">{gitStatus.branch}</span>
          {gitStatus.tracking && (
            <span className="text-gray-500 text-xs flex items-center gap-1">
              {gitStatus.ahead > 0 && <span className="text-green-400">{gitStatus.ahead}↑</span>}
              {gitStatus.behind > 0 && <span className="text-red-400">{gitStatus.behind}↓</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-gray-500 text-xs">
            {gitChanges.length} {gitChanges.length === 1 ? "change" : "changes"}
          </span>
          <button
            onClick={onRefresh}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
            title="Refresh"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {gitChanges.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <svg className="w-6 h-6 mx-auto mb-1.5 text-green-500 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xs">Working tree clean</p>
            </div>
          </div>
        ) : (
          gitChanges.map((change) => {
            const config = STATUS_CONFIG.get(change.status);
            const filename = change.path.split("/").pop() || change.path;
            const dir = change.path.includes("/")
              ? change.path.slice(0, change.path.lastIndexOf("/"))
              : "";
            const isSelected = selectedDiffPath === change.path;

            return (
              <button
                key={change.path}
                onClick={() => onDiffSelect(change.path)}
                className={`w-full flex items-center gap-2 px-3 py-1 text-left hover:bg-gray-700/50 transition-colors ${
                  isSelected ? "bg-orange-600/20 text-orange-300" : ""
                }`}
              >
                {/* Status badge */}
                <span className={`w-4 text-center font-mono text-xs font-bold shrink-0 ${config?.color || "text-gray-400"}`}>
                  {config?.label || "?"}
                </span>
                {/* Filename + path */}
                <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                  <span className={`truncate ${isSelected ? "text-orange-300" : "text-gray-200"}`}>
                    {filename}
                  </span>
                  {dir && (
                    <span className="text-gray-500 text-xs truncate shrink-0">{dir}</span>
                  )}
                </div>
                {/* Insertions / deletions */}
                {(change.insertions != null || change.deletions != null) && (
                  <span className="text-xs shrink-0 flex gap-1">
                    {change.insertions != null && change.insertions > 0 && (
                      <span className="text-green-400">+{change.insertions}</span>
                    )}
                    {change.deletions != null && change.deletions > 0 && (
                      <span className="text-red-400">-{change.deletions}</span>
                    )}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
});
