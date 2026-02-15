import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { registerTerminalWriter, unregisterTerminalWriter } from '../lib/terminalRegistry';
import '@xterm/xterm/css/xterm.css';

interface XTerminalProps {
  terminalId: string;
  isActive: boolean;
  onInput: (id: string, base64Data: string) => void;
  onResize: (id: string, cols: number, rows: number) => void;
}

export function XTerminal({ terminalId, isActive, onInput, onResize }: XTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const onInputRef = useRef(onInput);
  const onResizeRef = useRef(onResize);

  // Keep refs up to date
  onInputRef.current = onInput;
  onResizeRef.current = onResize;

  // Initialize terminal once
  useEffect(() => {
    console.log('[XTerminal] Effect running, terminalId:', terminalId, 'isActive:', isActive, 'container:', containerRef.current);
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: '"MesloLGS Nerd Font", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0a0a0f',
        foreground: '#e4e4e7',
        cursor: '#f97316',
        selectionBackground: '#f9731640',
        black: '#18181b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#fafafa',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    console.log('[XTerminal] Opening terminal in container:', containerRef.current, 'visible:', containerRef.current.offsetParent !== null);
    term.open(containerRef.current);
    console.log('[XTerminal] Terminal opened');

    // Use stable canvas renderer (WebGL can cause rendering issues on mobile)
    fitAddon.fit();

    // Send user keystrokes to server as base64
    term.onData((data: string) => {
      try {
        onInputRef.current(terminalId, btoa(data));
      } catch (error) {
        console.error('[XTerminal] btoa failed for input:', {
          data,
          charCodes: Array.from(data).map(c => c.charCodeAt(0)),
          error
        });
        // Fallback: encode as UTF-8 safely (no spread operator)
        const encoder = new TextEncoder();
        const bytes = encoder.encode(data);
        let binaryString = '';
        for (let i = 0; i < bytes.length; i++) {
          binaryString += String.fromCharCode(bytes[i]);
        }
        onInputRef.current(terminalId, btoa(binaryString));
      }
    });

    termRef.current = term;
    fitRef.current = fitAddon;

    // Register writer in module-level registry
    registerTerminalWriter(terminalId, (base64Data: string) => {
      try {
        const raw = atob(base64Data);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
          bytes[i] = raw.charCodeAt(i);
        }
        console.log('[XTerminal] Calling term.write(), bytes:', bytes.length);
        term.write(bytes);
        console.log('[XTerminal] term.write() completed');
      } catch (e) {
        console.error('[XTerminal] Error in writer:', e);
      }
    });

    onResizeRef.current(terminalId, term.cols, term.rows);

    return () => {
      unregisterTerminalWriter(terminalId);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [terminalId]);

  // Auto-resize on visibility change and container resize
  useEffect(() => {
    if (!isActive || !containerRef.current || !fitRef.current) return;

    const fit = fitRef.current;
    const term = termRef.current;

    // Fit when becoming active (may have been hidden)
    requestAnimationFrame(() => {
      try {
        fit.fit();
        if (term) {
          onResizeRef.current(terminalId, term.cols, term.rows);
        }
      } catch {
        // Container might not have dimensions yet
      }
    });

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try {
          fit.fit();
          if (term) {
            onResizeRef.current(terminalId, term.cols, term.rows);
          }
        } catch {
          // Ignore resize errors during unmount
        }
      });
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isActive, terminalId]);

  // Focus terminal when it becomes active
  useEffect(() => {
    if (isActive && termRef.current) {
      termRef.current.focus();
    }
  }, [isActive]);

  console.log('[XTerminal] Rendering, terminalId:', terminalId, 'isActive:', isActive);

  return (
    <div
      ref={containerRef}
      className="h-full w-full absolute inset-0"
      style={{
        visibility: isActive ? 'visible' : 'hidden',
        zIndex: isActive ? 1 : 0
      }}
    />
  );
}
