import { useState, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  Message,
  ContentBlock,
  TextBlock,
  ThinkingBlock,
  ImageBlock,
  ToolUseBlock,
  ToolResultBlock,
} from '@shared/types';

// Fullscreen image viewer modal
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-100 bg-black/90 flex items-center justify-center cursor-zoom-out"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors z-10"
        aria-label="Close"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      {/* Image */}
      <img
        src={src}
        alt="Fullscreen preview"
        className="max-w-[95vw] max-h-[95vh] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      {/* Hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-sm">
        Click anywhere or press Esc to close
      </div>
    </div>
  );
}

interface MessageListProps {
  messages: Message[];
}

// Content Modal for viewing full tool use/result content
function ContentModal({
  title,
  content,
  isError,
  onClose,
}: {
  title: string;
  content: string;
  isError?: boolean;
  onClose: () => void;
}) {
  // Handle Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-100 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`relative max-w-4xl w-full max-h-[85vh] rounded-xl border overflow-hidden ${
          isError ? 'bg-gray-900 border-red-700' : 'bg-gray-900 border-gray-700'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b ${
            isError ? 'border-red-700 bg-red-900/30' : 'border-gray-700 bg-gray-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {isError ? (
              <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            )}
            <span className={`font-medium ${isError ? 'text-red-400' : 'text-orange-400'}`}>{title}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white transition-colors rounded"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Content */}
        <div className="overflow-auto max-h-[calc(85vh-56px)] p-4">
          <pre className="text-sm text-gray-300 whitespace-pre-wrap break-all font-mono">{content}</pre>
        </div>
        {/* Footer hint */}
        <div className="absolute bottom-6 right-6 text-xs text-gray-500">Press Esc to close</div>
      </div>
    </div>
  );
}

// Strip system tags from text (ide_opened_file, system-reminder, etc.)
function stripSystemTags(text: string): string {
  let stripped = text
    .replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g, '')
    .replace(/<ide_selection>[\s\S]*?<\/ide_selection>/g, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<user-prompt-submit-hook>[\s\S]*?<\/user-prompt-submit-hook>/g, '');

  // Strip AWF workflow content (YAML frontmatter + markdown body)
  // Pattern: starts with @[/workflow] or just the workflow mention, followed by YAML frontmatter
  // Example input: "@[/save_brain] \n## User Input\n\n```text\n...\n```\n\n## Goal\n..."
  const workflowPattern = /@\[\/[\w_-]+\]\s*\n/;
  if (workflowPattern.test(stripped)) {
    // Keep only the workflow command mention, strip everything after
    const match = stripped.match(/@\[\/[\w_-]+\]/);
    if (match) {
      stripped = match[0];
    }
  }

  // Also strip standalone workflow content that starts with "## User Input" or "## Goal"
  // This handles cases where the @[] mention was already stripped
  // Use (^|\n) to match at start of string OR after newline
  stripped = stripped
    .replace(/(^|\n)## User Input[\s\S]*$/g, '')
    .replace(/(^|\n)## Goal[\s\S]*$/g, '')
    .replace(/(^|\n)## Execution Steps[\s\S]*$/g, '')
    .replace(/(^|\n)## Operating[\s\S]*$/g, '')
    .replace(/(^|\n)## Context[\s\S]*$/g, '')
    .replace(/(^|\n)## Giai đoạn[\s\S]*$/g, '')
    .replace(/(^|\n)You \*\*MUST\*\*[\s\S]*$/g, '');

  return stripped.trim();
}

// Helper to extract text content from message
function getTextContent(content: string | ContentBlock[], stripSystem = false): string {
  let text = '';

  if (typeof content === 'string') {
    text = content;
  } else if (!Array.isArray(content)) {
    text = String(content || '');
  } else {
    text = content
      .filter((block): block is TextBlock => block?.type === 'text')
      .map((block) => block.text || '')
      .join('\n');
  }

  return stripSystem ? stripSystemTags(text) : text;
}

// Helper to get thinking blocks from content
function getThinkingBlocks(content: string | ContentBlock[]): ThinkingBlock[] {
  if (typeof content === 'string' || !Array.isArray(content)) return [];
  return content.filter((block): block is ThinkingBlock => block?.type === 'thinking');
}

// Helper to get image blocks from content
function getImageBlocks(content: string | ContentBlock[]): ImageBlock[] {
  if (typeof content === 'string' || !Array.isArray(content)) return [];
  return content.filter((block): block is ImageBlock => block?.type === 'image');
}

// Helper to get tool uses from content
function getToolUses(content: string | ContentBlock[]): ToolUseBlock[] {
  if (typeof content === 'string' || !Array.isArray(content)) return [];
  return content.filter((block): block is ToolUseBlock => block?.type === 'tool_use');
}

// Helper to get tool results from content
function getToolResults(content: string | ContentBlock[]): ToolResultBlock[] {
  if (typeof content === 'string' || !Array.isArray(content)) return [];
  return content.filter((block): block is ToolResultBlock => block?.type === 'tool_result');
}

// Render a thinking block with collapse/expand
function ThinkingDisplay({ thinking }: { thinking: ThinkingBlock }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Truncate for preview
  const previewText =
    thinking.thinking.length > 100 ? thinking.thinking.slice(0, 100) + '...' : thinking.thinking;

  return (
    <div className="my-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300 transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
        <span className="font-medium">Thinking</span>
        <svg
          className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded ? (
        <div className="mt-2 pl-3 border-l-2 border-gray-600 text-xs text-gray-400 whitespace-pre-wrap">
          {thinking.thinking}
        </div>
      ) : (
        <div className="mt-1 pl-3 text-xs text-gray-500 truncate">{previewText}</div>
      )}
    </div>
  );
}

// Render an image block
function ImageDisplay({ image, onImageClick }: { image: ImageBlock; onImageClick?: (src: string) => void }) {
  const src = `data:${image.source.media_type};base64,${image.source.data}`;

  return (
    <div className="my-2">
      <img
        src={src}
        alt="Attached image"
        className="max-w-full rounded-lg border border-gray-600 max-h-[400px] object-contain cursor-zoom-in hover:opacity-90 transition-opacity"
        loading="lazy"
        onClick={() => onImageClick?.(src)}
      />
    </div>
  );
}

// Render a tool use block
function ToolUseDisplay({ tool }: { tool: ToolUseBlock }) {
  const [showModal, setShowModal] = useState(false);
  const inputStr = typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input, null, 2);

  // Truncate long inputs
  const isTruncated = inputStr.length > 200;
  const displayInput = isTruncated ? inputStr.slice(0, 200) + '...' : inputStr;

  return (
    <>
      <div
        className={`my-2 bg-gray-700/50 rounded-lg p-2 border border-gray-600 ${isTruncated ? 'cursor-pointer hover:bg-gray-700/70 transition-colors' : ''}`}
        onClick={isTruncated ? () => setShowModal(true) : undefined}
      >
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span className="font-medium text-orange-400">{tool.name}</span>
          {isTruncated && <span className="text-gray-500 text-[10px] ml-auto">Click to expand</span>}
        </div>
        {displayInput && (
          <pre className="text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap break-all">
            {displayInput}
          </pre>
        )}
      </div>
      {showModal && (
        <ContentModal title={`Tool: ${tool.name}`} content={inputStr} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}

// Check if content contains image blocks (for tool results)
function extractImagesFromToolResult(content: unknown[]): ImageBlock[] {
  if (!Array.isArray(content)) return [];
  return content.filter(
    (item): item is ImageBlock =>
      typeof item === 'object' && item !== null && (item as ImageBlock).type === 'image',
  );
}

// Render a tool result block
function ToolResultDisplay({
  result,
  onImageClick,
}: {
  result: ToolResultBlock;
  onImageClick?: (src: string) => void;
}) {
  const [showModal, setShowModal] = useState(false);

  // Check for images in array content
  const images = Array.isArray(result.content) ? extractImagesFromToolResult(result.content) : [];

  // Handle content that might be string or array
  let contentStr = '';
  if (typeof result.content === 'string') {
    contentStr = result.content;
  } else if (Array.isArray(result.content)) {
    // Filter out image blocks and stringify the rest
    const nonImageContent = result.content.filter(
      (item) => typeof item !== 'object' || (item as { type?: string }).type !== 'image',
    );
    contentStr = nonImageContent.length > 0 ? JSON.stringify(nonImageContent, null, 2) : '';
  } else {
    contentStr = String(result.content || '');
  }

  // Truncate long results
  const isTruncated = contentStr.length > 300;
  const displayContent = isTruncated ? contentStr.slice(0, 300) + '...' : contentStr;

  return (
    <>
      <div
        className={`my-2 rounded-lg p-2 border ${
          result.is_error ? 'bg-red-900/30 border-red-700' : 'bg-green-900/30 border-green-700'
        } ${isTruncated ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
        onClick={isTruncated ? () => setShowModal(true) : undefined}
      >
        <div className="flex items-center gap-2 text-xs mb-1">
          {result.is_error ? (
            <>
              <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-red-400 font-medium">Error</span>
            </>
          ) : (
            <>
              <svg
                className="w-3.5 h-3.5 text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-green-400 font-medium">Result</span>
            </>
          )}
          {isTruncated && <span className="text-gray-500 text-[10px] ml-auto">Click to expand</span>}
        </div>
        {/* Render images from tool result */}
        {images.length > 0 && (
          <div className="mb-2">
            {images.map((image, idx) => (
              <ImageDisplay key={idx} image={image} onImageClick={onImageClick} />
            ))}
          </div>
        )}
        {displayContent && (
          <pre className="text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap break-all">
            {displayContent}
          </pre>
        )}
      </div>
      {showModal && (
        <ContentModal
          title={result.is_error ? 'Error Result' : 'Tool Result'}
          content={contentStr}
          isError={result.is_error}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// Command Display Component
function CommandDisplay({ command, name }: { command: string; name?: string }) {
  return (
    <div className="flex flex-col gap-1 my-2 bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
      <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span>Workflow Command</span>
      </div>
      <div className="font-mono text-sm text-gray-200">{name || command}</div>
      {name && name !== command && <div className="text-xs text-gray-500 font-mono">Action: {command}</div>}
    </div>
  );
}

// Copy Button Component
function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: any) => {
    e.stopPropagation();

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts (e.g. HTTP local mobile testing)
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } finally {
          textArea.remove();
        }
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`p-1.5 rounded hover:bg-black/30 transition-all ${
        copied ? 'text-green-300' : 'text-white/70 hover:text-white'
      } ${className}`}
      title="Copy message"
    >
      {copied ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  );
}

export function MessageList({ messages }: MessageListProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const handleImageClick = useCallback((src: string) => {
    setLightboxSrc(src);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxSrc(null);
  }, []);

  // Handle Escape key to close lightbox
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setLightboxSrc(null);
    }
  }, []);

  // Add/remove keyboard listener when lightbox is open
  useEffect(() => {
    if (lightboxSrc) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [lightboxSrc, handleKeyDown]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <svg
            className="w-16 h-16 mx-auto mb-4 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <p>Start a conversation with Claude</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => {
          // Safely extract content with error handling
          let textContent = '';
          let thinkingBlocks: ThinkingBlock[] = [];
          let imageBlocks: ImageBlock[] = [];
          let toolUses: ToolUseBlock[] = [];
          let toolResults: ToolResultBlock[] = [];
          let commandInfo: { message?: string; name?: string } | null = null;
          const isUser = message.role === 'user';

          try {
            // Strip system tags for user messages (but keep command tags for parsing)

            // Extract command tags if present
            let displayContent = message.content;

            if (typeof message.content === 'string') {
              const cmdMsgMatch = message.content.match(/<command-message>(.*?)<\/command-message>/);
              const cmdNameMatch = message.content.match(/<command-name>(.*?)<\/command-name>/);

              if (cmdMsgMatch || cmdNameMatch) {
                commandInfo = {
                  message: cmdMsgMatch ? cmdMsgMatch[1] : undefined,
                  name: cmdNameMatch ? cmdNameMatch[1] : undefined,
                };
                // Remove tags from display content
                displayContent = message.content
                  .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
                  .replace(/<command-name>[\s\S]*?<\/command-name>/g, '');
              }
            } else if (Array.isArray(message.content)) {
              displayContent = message.content.map((block: any) => {
                if (block.type === 'text') {
                  const cmdMsgMatch = block.text.match(/<command-message>(.*?)<\/command-message>/);
                  const cmdNameMatch = block.text.match(/<command-name>(.*?)<\/command-name>/);

                  if (cmdMsgMatch || cmdNameMatch) {
                    if (!commandInfo) {
                      commandInfo = {
                        message: cmdMsgMatch ? cmdMsgMatch[1] : undefined,
                        name: cmdNameMatch ? cmdNameMatch[1] : undefined,
                      };
                    }
                    return {
                      ...block,
                      text: block.text
                        .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
                        .replace(/<command-name>[\s\S]*?<\/command-name>/g, ''),
                    };
                  }
                }
                return block;
              });
            }

            textContent = getTextContent(displayContent, true); // Always strip system tags and workflow content
            thinkingBlocks = getThinkingBlocks(message.content);
            imageBlocks = getImageBlocks(message.content);
            toolUses = getToolUses(message.content);
            toolResults = getToolResults(message.content);
          } catch (e) {
            console.error('Error parsing message content:', e, message);
            textContent =
              typeof message.content === 'string'
                ? stripSystemTags(message.content)
                : '[Error displaying message]';
          }

          // Check if this is a tool result message (user role but contains tool_result)
          const isToolResultOnly = toolResults.length > 0 && !textContent.trim() && !commandInfo;
          const isUserMessage = isUser && !isToolResultOnly;

          // Skip rendering if message has no visible content
          const hasVisibleContent =
            textContent.trim() ||
            commandInfo ||
            thinkingBlocks.length > 0 ||
            imageBlocks.length > 0 ||
            toolUses.length > 0 ||
            toolResults.length > 0 ||
            message.isStreaming;

          if (!hasVisibleContent) {
            return null;
          }

          return (
            <div key={message.id} className={`flex ${isUserMessage ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 relative group ${
                  isUserMessage
                    ? 'bg-orange-600 text-white rounded-br-md'
                    : isToolResultOnly
                      ? 'bg-gray-800/50 text-gray-100 rounded-bl-md border border-gray-700'
                      : 'bg-gray-800 text-gray-100 rounded-bl-md'
                }`}
              >
                {/* Thinking blocks (from assistant) */}
                {thinkingBlocks.length > 0 && (
                  <div className="mb-2">
                    {thinkingBlocks.map((thinking, idx) => (
                      <ThinkingDisplay key={idx} thinking={thinking} />
                    ))}
                  </div>
                )}

                {/* Image blocks */}
                {imageBlocks.length > 0 && (
                  <div className="mb-2">
                    {imageBlocks.map((image, idx) => (
                      <ImageDisplay key={idx} image={image} onImageClick={handleImageClick} />
                    ))}
                  </div>
                )}

                {/* Command Display */}
                {commandInfo && (
                  <CommandDisplay command={commandInfo.message || ''} name={commandInfo.name} />
                )}

                {/* Text content */}
                {textContent &&
                  (message.role === 'assistant' ? (
                    <div className="prose prose-invert prose-sm max-w-none overflow-x-hidden">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          pre: ({ children }) => (
                            <pre className="bg-gray-900 rounded-lg p-3 overflow-x-auto text-sm">
                              {children}
                            </pre>
                          ),
                          code: ({ className, children, ...props }) => {
                            const isInline = !className;
                            return isInline ? (
                              <code className="bg-gray-700 px-1.5 py-0.5 rounded-sm text-sm" {...props}>
                                {children}
                              </code>
                            ) : (
                              <code className={className} {...props}>
                                {children}
                              </code>
                            );
                          },
                        }}
                      >
                        {textContent}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap wrap-break-word">{textContent}</p>
                  ))}

                {/* Tool uses (from assistant) */}
                {toolUses.length > 0 && (
                  <div className="mt-2">
                    {toolUses.map((tool) => (
                      <ToolUseDisplay key={tool.id} tool={tool} />
                    ))}
                  </div>
                )}

                {/* Tool results (from user/system) */}
                {toolResults.length > 0 && (
                  <div className="mt-2">
                    {toolResults.map((result) => (
                      <ToolResultDisplay
                        key={result.tool_use_id}
                        result={result}
                        onImageClick={handleImageClick}
                      />
                    ))}
                  </div>
                )}

                {message.isStreaming && (
                  <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-1 rounded-sm" />
                )}
                {/* Copy Button Footer */}
                {textContent && (
                  <div className="flex justify-end mt-2 opacity-50 hover:opacity-100 transition-opacity">
                    <CopyButton text={textContent} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Fullscreen image lightbox */}
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={closeLightbox} />}
    </>
  );
}
