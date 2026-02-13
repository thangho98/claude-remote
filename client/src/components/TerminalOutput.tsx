import { useRef, useEffect, useMemo } from "react";

interface TerminalOutputProps {
  output: string[];
  onClear?: () => void;
  hideHeader?: boolean;
}

const CHUNK_SIZE = 50;

export function TerminalOutput({ output, onClear, hideHeader }: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [output]);

  // Memoize converted HTML so existing lines aren't reprocessed on each append
  const convertedLines = useMemo(() => output.map(convertAnsiToHtml), [output]);

  // Group lines into chunks for content-visibility batching
  const chunks = useMemo(() => {
    const result: string[][] = [];
    for (let i = 0; i < convertedLines.length; i += CHUNK_SIZE) {
      result.push(convertedLines.slice(i, i + CHUNK_SIZE));
    }
    return result;
  }, [convertedLines]);

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      {!hideHeader && (
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
      )}

      {/* Output */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-sm"
      >
        {output.length === 0 ? (
          <p className="text-gray-500">No output yet...</p>
        ) : (
          chunks.map((chunk, ci) => (
            <div
              key={ci}
              style={
                ci < chunks.length - 1
                  ? { contentVisibility: "auto", containIntrinsicSize: `auto ${chunk.length * 1.4}em` }
                  : undefined
              }
            >
              {chunk.map((html, li) => (
                <div
                  key={ci * CHUNK_SIZE + li}
                  className="text-gray-300 whitespace-pre-wrap break-all"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Hoisted ANSI regex and color map (avoid recreation per call)
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[([0-9;]+)m/g;
const ANSI_COLORS: Record<string, string> = {
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

// Simple ANSI to HTML converter
function convertAnsiToHtml(text: string): string {
  let result = text;

  // Replace ANSI codes with spans
  ANSI_REGEX.lastIndex = 0;
  result = result.replace(ANSI_REGEX, (_, codes) => {
    const codeList = codes.split(";");
    const styles = codeList
      .map((code: string) => ANSI_COLORS[code])
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
