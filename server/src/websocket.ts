import type { ServerWebSocket } from 'bun';
import type { WSClientEvent, WSServerEvent } from '../../shared/types';
import { getFileTree, readFileContent, isPathSafe } from './services/file';
import { listProjects } from './services/project';
import { listSessions, getSessionInfo, getSessionMessages } from './services/session';
import { listCommands } from './services/commands';
import { isGitRepo, getGitStatus, getGitChanges, getGitDiff } from './services/git';
import { getClaudeProvider } from './claude/providers';
import { getOrCreateSession } from './claude/session';
import { subscribeToRoom, unsubscribeAll, getSubscribedRooms } from './rooms';
import { createTerminal, writeToTerminal, resizeTerminal, closeTerminal, closeAllTerminals, closeTerminalsByDirectory } from './services/terminal';

// Track all active WebSocket connections
const activeConnections = new Set<ServerWebSocket<WSData>>();

export function getConnections(): ServerWebSocket<WSData>[] {
  return Array.from(activeConnections);
}

export function getConnectionStats(): { project: string | null; session: string | null }[] {
  return Array.from(activeConnections).map((ws) => ({
    project: ws.data.workingDirectory,
    session: ws.data.currentSessionId,
  }));
}

export interface WSData {
  authenticated: boolean;
  workingDirectory: string | null; // Set when project is selected
  currentSessionId: string | null;
}

export function createWebSocketHandlers() {
  return {
    open(ws: ServerWebSocket<WSData>) {
      activeConnections.add(ws);
      console.log('🔌 WebSocket client connected');
    },

    async message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
      try {
        const msgStr = message.toString();
        console.log('📩 Received WS message:', msgStr.slice(0, 100));
        const event: WSClientEvent = JSON.parse(msgStr);
        await handleEvent(ws, event);
      } catch (error) {
        console.error('Invalid message:', error);
        send(ws, { type: 'message:error', error: 'Invalid message format', id: '' });
      }
    },

    close(ws: ServerWebSocket<WSData>) {
      const rooms = getSubscribedRooms(ws);
      console.log('🔌 WebSocket client disconnected', rooms);
      closeAllTerminals(ws);
      unsubscribeAll(ws);
      activeConnections.delete(ws);
    },
  };
}

async function handleEvent(ws: ServerWebSocket<WSData>, event: WSClientEvent) {
  switch (event.type) {
    case 'auth':
      send(ws, { type: 'auth:success', user: { authenticated: true } });
      // Send project list on auth
      const projects = await listProjects();
      send(ws, { type: 'project:list', projects });
      break;

    case 'message':
      await handleMessage(ws, event.content);
      break;

    case 'project:switch':
      // Clean up terminals from previous project
      if (ws.data.workingDirectory && ws.data.workingDirectory !== event.path) {
        closeTerminalsByDirectory(ws, ws.data.workingDirectory);
      }
      ws.data.workingDirectory = event.path;
      console.log(`📁 Switched to project: ${event.path}`);

      // Subscribe to project room
      subscribeToRoom(ws, 'project', event.path);

      // Send file tree for new project
      try {
        const tree = await getFileTree(event.path);
        send(ws, { type: 'file:tree', path: event.path, tree });
        send(ws, {
          type: 'project:current',
          project: { id: '', name: event.path.split('/').pop() || '', path: event.path },
        });

        // Auto-send session list after project switch
        const sessions = await listSessions(event.path);
        send(ws, { type: 'session:list', sessions });
        console.log(`📋 Sent ${sessions.length} sessions for ${event.path}`);

        // Auto-send git status after project switch
        try {
          const isRepo = await isGitRepo(event.path);
          if (isRepo) {
            const gitStatus = await getGitStatus(event.path);
            send(ws, { type: 'git:status', status: gitStatus });
            const gitChanges = await getGitChanges(event.path);
            send(ws, { type: 'git:changes', changes: gitChanges });
            console.log(`🔀 Sent git status: ${gitStatus.branch} (${gitChanges.length} changes)`);
          } else {
            send(ws, { type: 'git:status', status: { branch: '', ahead: 0, behind: 0, isGitRepo: false } });
            send(ws, { type: 'git:changes', changes: [] });
          }
        } catch (gitError) {
          console.error('Failed to get git status on project switch:', gitError);
        }
      } catch (error) {
        console.error(`❌ Error in project:switch:`, error);
        send(ws, { type: 'message:error', error: 'Failed to load project', id: '' });
      }
      break;

    case 'file:read':
      await handleFileRead(ws, event.path);
      break;

    case 'file:list':
      await handleFileList(ws, event.path);
      break;

    case 'session:list':
      await handleSessionList(ws);
      break;

    case 'session:switch':
      await handleSessionSwitch(ws, event.sessionId);
      break;

    case 'session:new':
      handleSessionNew(ws);
      break;

    case 'commands:list':
      await handleCommandsList(ws);
      break;

    case 'git:status':
      await handleGitStatusEvent(ws);
      break;

    case 'git:diff':
      await handleGitDiffEvent(ws, event.path, event.staged);
      break;

    case 'terminal:create':
      handleTerminalCreate(ws, event.id, event.cols, event.rows);
      break;

    case 'terminal:input':
      handleTerminalInput(ws, event.id, event.data);
      break;

    case 'terminal:resize':
      handleTerminalResize(event.id, event.cols, event.rows);
      break;

    case 'terminal:close':
      handleTerminalClose(ws, event.id);
      break;

    default:
      console.warn('Unknown event type:', event);
  }
}

async function handleMessage(ws: ServerWebSocket<WSData>, content: string) {
  if (!ws.data.workingDirectory) {
    send(ws, { type: 'message:error', error: 'No project selected', id: '' });
    return;
  }

  const id = crypto.randomUUID();
  const session = getOrCreateSession(ws.data.workingDirectory);
  const sessionId = ws.data.currentSessionId;

  console.log(
    `💬 Message received in ${session.workingDirectory}: "${content.slice(0, 50)}..."${sessionId ? ` (resuming session ${sessionId})` : ''}`,
  );

  try {
    const provider = await getClaudeProvider();
    await provider.query({
      prompt: content,
      workingDirectory: session.workingDirectory,
      sessionId,
      handlers: {
        onChunk: (chunk) => {
          send(ws, { type: 'message:chunk', content: chunk, id });
        },
        onDone: async () => {
          send(ws, { type: 'message:done', id });
          console.log(`✅ Message ${id} completed`);

          // Refresh session list and info after message completes
          try {
            const sessions = await listSessions(ws.data.workingDirectory!);
            send(ws, { type: 'session:list', sessions });
            console.log(`🔄 Refreshed session list (${sessions.length} sessions)`);

            // Update session info (model + token usage)
            if (ws.data.currentSessionId) {
              const info = await getSessionInfo(ws.data.workingDirectory!, ws.data.currentSessionId);
              if (info) {
                send(ws, { type: 'session:info', model: info.model, usage: info.usage });
              }
            }
          } catch (error) {
            console.error('Failed to refresh sessions:', error);
          }
        },
        onError: (error) => {
          send(ws, { type: 'message:error', error, id });
          console.error(`❌ Message ${id} error:`, error);
        },
        onToolUse: (tool, input) => {
          send(ws, { type: 'terminal:output', content: `[${tool}] ${input}` });
          send(ws, { type: 'message:tool_use', id, toolName: tool, toolInput: input });
        },
        onToolResult: (tool, result) => {
          console.log(`📡 Sending tool result for ${tool} (${result.length} chars)`);
          send(ws, { type: 'terminal:output', content: result });
        },
        onThinking: (isThinking) => {
          send(ws, { type: 'message:thinking', isThinking });
        },
        onThinkingContent: (content) => {
          send(ws, { type: 'message:thinking_content', id, content });
        },
        onSessionId: async (newSessionId) => {
          ws.data.currentSessionId = newSessionId;
          send(ws, { type: 'session:id', sessionId: newSessionId });
          console.log(`📋 Updated current session: ${newSessionId}`);

          // Send session info (model + token usage) for new session
          const info = await getSessionInfo(ws.data.workingDirectory!, newSessionId);
          if (info) {
            send(ws, { type: 'session:info', model: info.model, usage: info.usage });
          }
        },
        onMessage: (message) => {
          send(ws, { type: 'message:append', message });
        },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    send(ws, { type: 'message:error', error: errorMessage, id });
    console.error(`❌ Failed to process message:`, error);
  }
}

async function handleFileRead(ws: ServerWebSocket<WSData>, path: string) {
  console.log(`📄 Reading file: ${path} (workingDir: ${ws.data.workingDirectory})`);
  try {
    // Security check
    if (ws.data.workingDirectory && !isPathSafe(ws.data.workingDirectory, path)) {
      console.warn(`⚠️ Access denied: ${path} not within ${ws.data.workingDirectory}`);
      send(ws, { type: 'message:error', error: 'Access denied', id: '' });
      return;
    }

    const content = await readFileContent(path);
    console.log(`✅ File read successfully: ${path} (${content.length} chars)`);
    send(ws, { type: 'file:content', path, content });
  } catch (error) {
    console.error(`❌ Failed to read file: ${path}`, error);
    send(ws, { type: 'message:error', error: `Failed to read file: ${path}`, id: '' });
  }
}

async function handleFileList(ws: ServerWebSocket<WSData>, path: string) {
  try {
    const tree = await getFileTree(path);
    send(ws, { type: 'file:tree', path, tree });
  } catch (error) {
    send(ws, { type: 'message:error', error: `Failed to list files: ${path}`, id: '' });
  }
}

async function handleSessionList(ws: ServerWebSocket<WSData>) {
  if (!ws.data.workingDirectory) {
    send(ws, { type: 'session:list', sessions: [] });
    return;
  }

  try {
    const sessions = await listSessions(ws.data.workingDirectory);
    send(ws, { type: 'session:list', sessions });
    console.log(`📋 Sent ${sessions.length} sessions for ${ws.data.workingDirectory}`);
  } catch (error) {
    console.error('Failed to list sessions:', error);
    send(ws, { type: 'session:list', sessions: [] });
  }
}

function handleSessionNew(ws: ServerWebSocket<WSData>) {
  ws.data.currentSessionId = null;
  console.log('🆕 Cleared session ID for new session');
  send(ws, { type: 'session:current', session: null });
}

async function handleSessionSwitch(ws: ServerWebSocket<WSData>, sessionId: string) {
  if (!ws.data.workingDirectory) {
    return;
  }

  ws.data.currentSessionId = sessionId;
  console.log(`🔄 Switched to session: ${sessionId}`);

  // Subscribe to session room
  subscribeToRoom(ws, 'session', sessionId);

  // Get session info and send it
  const info = await getSessionInfo(ws.data.workingDirectory, sessionId);
  if (info) {
    send(ws, { type: 'session:info', model: info.model, usage: info.usage });
  }

  // Refresh and send session list
  const sessions = await listSessions(ws.data.workingDirectory);
  send(ws, { type: 'session:list', sessions });

  // Find and send current session
  const currentSession = sessions.find((s) => s.id === sessionId);
  if (currentSession) {
    send(ws, { type: 'session:current', session: currentSession });
  }

  // Load and send session messages
  const rawMessages = await getSessionMessages(ws.data.workingDirectory, sessionId);
  const messages = rawMessages.map((m, i) => ({
    id: `${sessionId}-${i}`,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    timestamp: m.timestamp,
  }));
  send(ws, { type: 'session:messages', messages });
  console.log(`📨 Sent ${messages.length} messages for session ${sessionId}`);
}

async function handleCommandsList(ws: ServerWebSocket<WSData>) {
  try {
    const commands = await listCommands(ws.data.workingDirectory || undefined);
    send(ws, { type: 'commands:list', commands });
    console.log(`📋 Sent ${commands.length} commands`);
  } catch (error) {
    console.error('Failed to list commands:', error);
    send(ws, { type: 'commands:list', commands: [] });
  }
}

async function handleGitStatusEvent(ws: ServerWebSocket<WSData>) {
  if (!ws.data.workingDirectory) {
    send(ws, { type: 'git:error', error: 'No project selected' });
    return;
  }

  try {
    const isRepo = await isGitRepo(ws.data.workingDirectory);
    if (!isRepo) {
      send(ws, { type: 'git:status', status: { branch: '', ahead: 0, behind: 0, isGitRepo: false } });
      send(ws, { type: 'git:changes', changes: [] });
      return;
    }

    const status = await getGitStatus(ws.data.workingDirectory);
    send(ws, { type: 'git:status', status });

    const changes = await getGitChanges(ws.data.workingDirectory);
    send(ws, { type: 'git:changes', changes });
  } catch (error) {
    console.error('Failed to get git status:', error);
    send(ws, { type: 'git:error', error: 'Failed to get git status' });
  }
}

async function handleGitDiffEvent(ws: ServerWebSocket<WSData>, path: string, staged?: boolean) {
  if (!ws.data.workingDirectory) {
    send(ws, { type: 'git:error', error: 'No project selected' });
    return;
  }

  try {
    const diff = await getGitDiff(ws.data.workingDirectory, path, staged);
    send(ws, { type: 'git:diff', diff });
  } catch (error) {
    console.error(`Failed to get diff for ${path}:`, error);
    send(ws, { type: 'git:error', error: `Failed to get diff for ${path}` });
  }
}

function handleTerminalCreate(ws: ServerWebSocket<WSData>, id?: string, cols?: number, rows?: number) {
  if (!ws.data.workingDirectory) {
    send(ws, { type: 'terminal:error', id: id || '', error: 'No project selected' });
    return;
  }

  const terminalId = id || crypto.randomUUID();
  try {
    const session = createTerminal(ws, terminalId, ws.data.workingDirectory, cols, rows);
    send(ws, { type: 'terminal:created', session });
    console.log(`🖥️ Terminal created: ${terminalId} in ${ws.data.workingDirectory}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create terminal';
    send(ws, { type: 'terminal:error', id: terminalId, error: msg });
    console.error(`❌ Failed to create terminal:`, error);
  }
}

function handleTerminalInput(ws: ServerWebSocket<WSData>, id: string, data: string) {
  try {
    writeToTerminal(id, data);
  } catch (error) {
    send(ws, { type: 'terminal:error', id, error: 'Terminal not found' });
  }
}

function handleTerminalResize(id: string, cols: number, rows: number) {
  resizeTerminal(id, cols, rows);
}

function handleTerminalClose(ws: ServerWebSocket<WSData>, id: string) {
  closeTerminal(id);
  send(ws, { type: 'terminal:closed', id });
  console.log(`🖥️ Terminal closed: ${id}`);
}

function send(ws: ServerWebSocket<WSData>, event: WSServerEvent) {
  ws.send(JSON.stringify(event));
}
