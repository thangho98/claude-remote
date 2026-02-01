import { useState } from "react";
import type { FileNode } from "@shared/types";

interface FileExplorerProps {
  tree: FileNode | null;
  onFileSelect: (path: string) => void;
  selectedPath?: string;
}

export function FileExplorer({
  tree,
  onFileSelect,
  selectedPath,
}: FileExplorerProps) {
  if (!tree) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <p>No project selected</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-2">
      <FileTreeNode
        node={tree}
        depth={0}
        onFileSelect={onFileSelect}
        selectedPath={selectedPath}
      />
    </div>
  );
}

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  onFileSelect: (path: string) => void;
  selectedPath?: string;
}

function FileTreeNode({
  node,
  depth,
  onFileSelect,
  selectedPath,
}: FileTreeNodeProps) {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (node.type === "directory") {
      setIsOpen(!isOpen);
    } else {
      onFileSelect(node.path);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-gray-700/50 transition-colors ${
          isSelected ? "bg-orange-600/30 text-orange-300" : "text-gray-300"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.type === "directory" ? (
          <>
            <svg
              className={`w-4 h-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            <svg
              className="w-4 h-4 text-yellow-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          </>
        ) : (
          <>
            <span className="w-4" />
            <FileIcon filename={node.name} />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>

      {node.type === "directory" && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split(".").pop()?.toLowerCase();

  // Color based on file type
  let color = "text-gray-400";
  if (["ts", "tsx"].includes(ext || "")) color = "text-blue-400";
  else if (["js", "jsx"].includes(ext || "")) color = "text-yellow-400";
  else if (["json"].includes(ext || "")) color = "text-green-400";
  else if (["md", "mdx"].includes(ext || "")) color = "text-purple-400";
  else if (["css", "scss"].includes(ext || "")) color = "text-pink-400";
  else if (["html"].includes(ext || "")) color = "text-orange-400";

  return (
    <svg className={`w-4 h-4 ${color}`} fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
        clipRule="evenodd"
      />
    </svg>
  );
}
