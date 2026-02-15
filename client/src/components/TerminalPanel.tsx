import { lazy, Suspense } from 'react';
import type { TerminalSession } from '@shared/types';

const XTerminal = lazy(() => import('./XTerminal').then((m) => ({ default: m.XTerminal })));

interface TerminalPanelProps {
  terminalSessions: TerminalSession[];
  activeTerminalId: string | null;
  onSetActiveTerminal: (id: string | null) => void;
  onCreateTerminal: () => void;
  onCloseTerminal: (id: string) => void;
  onTerminalInput: (id: string, base64Data: string) => void;
  onTerminalResize: (id: string, cols: number, rows: number) => void;
}

export function TerminalPanel({
  terminalSessions,
  activeTerminalId,
  onSetActiveTerminal,
  onCreateTerminal,
  onCloseTerminal,
  onTerminalInput,
  onTerminalResize,
}: TerminalPanelProps) {
  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Tab bar */}
      <div className="flex items-center bg-[#252526] border-b border-[#1e1e1e] overflow-x-auto shrink-0">
        {terminalSessions.map((session, i) => (
          <div
            key={session.id}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs whitespace-nowrap border-r border-[#1e1e1e] transition-colors cursor-pointer group ${
              activeTerminalId === session.id
                ? 'bg-gray-950 text-gray-200 border-t-2 border-t-[#d97757]'
                : 'text-gray-500 hover:text-gray-300 border-t-2 border-t-transparent'
            }`}
            onClick={() => onSetActiveTerminal(session.id)}
          >
            <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{session.name} {i + 1}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseTerminal(session.id);
              }}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-opacity"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        <button
          onClick={onCreateTerminal}
          className="flex items-center px-2 py-1.5 text-gray-500 hover:text-gray-300 transition-colors"
          title="New Terminal"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden relative">
        {terminalSessions.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <button
              onClick={onCreateTerminal}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Create Terminal
            </button>
          </div>
        ) : (
          <Suspense fallback={<div className="h-full flex items-center justify-center text-gray-500 text-sm">Loading terminal...</div>}>
            {terminalSessions.map((session) => (
              <XTerminal
                key={session.id}
                terminalId={session.id}
                isActive={activeTerminalId === session.id}
                onInput={onTerminalInput}
                onResize={onTerminalResize}
              />
            ))}
          </Suspense>
        )}
      </div>
    </div>
  );
}
