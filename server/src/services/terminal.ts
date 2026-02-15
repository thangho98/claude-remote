import type { ServerWebSocket } from 'bun';
import type { TerminalSession } from '../../../shared/types';

// Re-use WSData from websocket module (avoid circular import by declaring locally)
interface WSData {
  authenticated: boolean;
  workingDirectory: string | null;
  currentSessionId: string | null;
}

const MAX_TERMINALS_PER_CONNECTION = 5;

interface ManagedTerminal {
  terminal: InstanceType<typeof Bun.Terminal>;
  proc: ReturnType<typeof Bun.spawn>;
  session: TerminalSession;
  ws: ServerWebSocket<WSData>;
}

const terminals = new Map<string, ManagedTerminal>();

function detectShell(): string {
  const shell = process.env.SHELL;
  if (shell) return shell;

  const candidates = ['/bin/zsh', '/bin/bash', '/bin/sh'];
  for (const c of candidates) {
    try {
      const file = Bun.file(c);
      if (file.size > 0) return c;
    } catch {
      continue;
    }
  }
  return '/bin/sh';
}

function countTerminalsForConnection(ws: ServerWebSocket<WSData>): number {
  let count = 0;
  for (const terminal of terminals.values()) {
    if (terminal.ws === ws) count++;
  }
  return count;
}

export function createTerminal(
  ws: ServerWebSocket<WSData>,
  id: string,
  workingDirectory: string,
  cols?: number,
  rows?: number,
): TerminalSession {
  if (countTerminalsForConnection(ws) >= MAX_TERMINALS_PER_CONNECTION) {
    throw new Error(`Maximum ${MAX_TERMINALS_PER_CONNECTION} terminals per connection`);
  }

  const shellPath = detectShell();
  const shellName = shellPath.split('/').pop() || 'shell';

  const session: TerminalSession = {
    id,
    name: shellName,
    shellPath,
    cwd: workingDirectory,
    createdAt: new Date().toISOString(),
  };

  const proc = Bun.spawn([shellPath, '-l'], {
    cwd: workingDirectory,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
    terminal: {
      cols: cols || 80,
      rows: rows || 24,
      data(_terminal: InstanceType<typeof Bun.Terminal>, data: Uint8Array) {
        const base64 = Buffer.from(data).toString('base64');
        try {
          ws.send(JSON.stringify({
            type: 'terminal:data',
            id,
            data: base64,
          }));
        } catch {
          closeTerminal(id);
        }
      },
      exit(_terminal: InstanceType<typeof Bun.Terminal>, _exitCode: number, _signal: string | null) {
        terminals.delete(id);
        try {
          ws.send(JSON.stringify({
            type: 'terminal:closed',
            id,
          }));
        } catch {
          // WebSocket already closed
        }
      },
    },
    onExit(_proc, exitCode) {
      // Process exited - clean up if not already done by terminal exit
      if (terminals.has(id)) {
        terminals.delete(id);
        try {
          ws.send(JSON.stringify({
            type: 'terminal:closed',
            id,
            exitCode,
          }));
        } catch {
          // WebSocket already closed
        }
      }
    },
  });

  terminals.set(id, { terminal: proc.terminal!, proc, session, ws });
  return session;
}

export function writeToTerminal(id: string, base64Data: string): void {
  const managed = terminals.get(id);
  if (!managed) throw new Error(`Terminal ${id} not found`);

  const data = Buffer.from(base64Data, 'base64');
  managed.terminal.write(data);
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  const managed = terminals.get(id);
  if (!managed) return;
  managed.terminal.resize(
    Math.max(1, Math.floor(cols)),
    Math.max(1, Math.floor(rows)),
  );
}

export function closeTerminal(id: string): void {
  const managed = terminals.get(id);
  if (!managed) return;
  try {
    managed.terminal.close();
    managed.proc.kill();
  } catch {
    // Already dead
  }
  terminals.delete(id);
}

export function closeAllTerminals(ws: ServerWebSocket<WSData>): void {
  for (const [id, managed] of terminals) {
    if (managed.ws === ws) {
      try {
        managed.terminal.close();
        managed.proc.kill();
      } catch {
        // Already dead
      }
      terminals.delete(id);
    }
  }
}

export function closeTerminalsByDirectory(ws: ServerWebSocket<WSData>, cwd: string): void {
  for (const [id, managed] of terminals) {
    if (managed.ws === ws && managed.session.cwd === cwd) {
      try {
        managed.terminal.close();
        managed.proc.kill();
      } catch {
        // Already dead
      }
      terminals.delete(id);
    }
  }
}
