interface FileViewerProps {
  path: string;
  content: string;
  onClose: () => void;
}

export function FileViewer({ path, content, onClose }: FileViewerProps) {
  const filename = path.split("/").pop() || path;
  const ext = filename.split(".").pop()?.toLowerCase();

  // Get language for syntax highlighting hint
  const getLanguageClass = () => {
    if (["ts", "tsx"].includes(ext || "")) return "text-blue-300";
    if (["js", "jsx"].includes(ext || "")) return "text-yellow-300";
    if (["json"].includes(ext || "")) return "text-green-300";
    if (["md", "mdx"].includes(ext || "")) return "text-purple-300";
    if (["css", "scss"].includes(ext || "")) return "text-pink-300";
    if (["html"].includes(ext || "")) return "text-orange-300";
    return "text-gray-300";
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 ${getLanguageClass()}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-sm font-medium text-gray-200 truncate max-w-[200px]">
            {filename}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-sm hover:bg-gray-700 text-gray-400 hover:text-white"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* File path */}
      <div className="px-4 py-1 text-xs text-gray-500 bg-gray-850 border-b border-gray-700">
        {path}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <pre className={`p-4 text-sm font-mono whitespace-pre-wrap wrap-break-word ${getLanguageClass()}`}>
          {content}
        </pre>
      </div>
    </div>
  );
}
