import { useRef, useEffect } from "react";

interface TerminalOutputProps {
  output: string[];
  onClear?: () => void;
}

export function TerminalOutput({ output, onClear }: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [output]);

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <span className="text-sm text-gray-400 ml-2">Terminal</span>
        </div>
        {onClear && output.length > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Output */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-sm"
      >
        {output.length === 0 ? (
          <p className="text-gray-500">No output yet...</p>
        ) : (
          output.map((line, index) => (
            <div
              key={index}
              className="text-gray-300 whitespace-pre-wrap break-all"
              dangerouslySetInnerHTML={{ __html: convertAnsiToHtml(line) }}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Simple ANSI to HTML converter
function convertAnsiToHtml(text: string): string {
  // Basic ANSI color codes
  const ansiColors: Record<string, string> = {
    "30": "color: #4a4a4a",
    "31": "color: #ff6b6b",
    "32": "color: #69db7c",
    "33": "color: #ffd43b",
    "34": "color: #74c0fc",
    "35": "color: #da77f2",
    "36": "color: #66d9e8",
    "37": "color: #f8f9fa",
    "90": "color: #868e96",
    "91": "color: #ff8787",
    "92": "color: #8ce99a",
    "93": "color: #ffe066",
    "94": "color: #91a7ff",
    "95": "color: #e599f7",
    "96": "color: #99e9f2",
    "97": "color: #ffffff",
    "1": "font-weight: bold",
    "0": "",
  };

  let result = text;

  // Replace ANSI codes with spans
  result = result.replace(/\x1b\[([0-9;]+)m/g, (_, codes) => {
    const codeList = codes.split(";");
    const styles = codeList
      .map((code: string) => ansiColors[code])
      .filter(Boolean)
      .join("; ");

    if (codes === "0") {
      return "</span>";
    }
    return styles ? `<span style="${styles}">` : "";
  });

  // Escape HTML but preserve our spans
  result = result
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;span/g, "<span")
    .replace(/&lt;\/span&gt;/g, "</span>");

  return result;
}
