import type { ServerWebSocket } from 'bun';
import type { WSClientEvent, WSServerEvent } from '../../shared/types';
import { getFileTree, readFileContent, writeFileContent, isPathSafe } from './services/file';
import { listProjects } from './services/project';
import { listSessions, getSessionInfo, getSessionMessages, deleteSession } from './services/session';
import { listCommands } from './services/commands';
import { isGitRepo, getGitStatus, getGitChanges, getGitDiff } from './services/git';
import { getClaudeProvider } from './claude/providers';
import { getOrCreateSession } from './claude/session';
import { subscribeToRoom, unsubscribeAll, getSubscribedRooms } from './rooms';
import { createTerminal, writeToTerminal, resizeTerminal, closeTerminal, closeAllTerminals, closeTerminalsByDirectory, reconnectTerminal, listTerminals } from './services/terminal';
import { getClaudeConfig, getMcpServers, getProviderInfo, listSettingsProfiles } from './services/settings';
import { fetchUsageQuota } from './services/usage';

// Configurable limits (match with client settings)
const MAX_SESSIONS_PER_PROJECT = 15;

// Track all active WebSocket connections
const activeConnections = new Set<ServerWebSocket<WSData>>();

// Pending tool permission requests: requestId → resolve callback
const pendingPermissions = new Map<string, (result: { allowed: boolean }) => void>();

// Track last used profile per session: sessionId → profilePath
const sessionLastProfile = new Map<string, string>();

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
      // Send existing terminal sessions (for reconnection)
      const existingTerminals = listTerminals(ws);
      if (existingTerminals.length > 0) {
        send(ws, { type: 'terminal:sessions', sessions: existingTerminals });
      }
      // Models loaded via piggyback on first user query
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
        const trimmedSessions = sessions.length > MAX_SESSIONS_PER_PROJECT
          ? sessions.slice(0, MAX_SESSIONS_PER_PROJECT)
          : sessions;
        send(ws, { type: 'session:list', sessions: trimmedSessions });
        console.log(`📋 Sent ${trimmedSessions.length}/${sessions.length} sessions for ${event.path}`);

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

    case 'file:write':
      await handleFileWrite(ws, event.path, event.content);
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

    case 'terminal:reconnect':
      handleTerminalReconnect(ws);
      break;

    case 'settings:get':
      await handleSettingsGet(ws);
      break;

    case 'tool:permission_response': {
      const resolve = pendingPermissions.get(event.requestId);
      if (resolve) {
        pendingPermissions.delete(event.requestId);
        resolve({ allowed: event.allowed });
      }
      break;
    }

    case 'model:set':
      handleModelSet(ws, event.model);
      break;

    case 'profiles:list':
      await handleProfilesList(ws);
      break;

    case 'browse:list':
      await handleBrowseList(ws, event.path);
      break;

    case 'profile:set': {
      const oldProfile = (ws.data as any).settingsProfile;
      const newProfile = event.profilePath || undefined;
      (ws.data as any).settingsProfile = newProfile;

      // Save profile to session mapping if we have a current session
      if (ws.data.currentSessionId && newProfile) {
        sessionLastProfile.set(ws.data.currentSessionId, newProfile);
        console.log(`💾 Saved profile '${newProfile}' for session ${ws.data.currentSessionId}`);
      }

      // If profile changed, clear current session to force new session
      // (SDK doesn't support changing profile on resumed session)
      if (oldProfile !== newProfile && ws.data.currentSessionId) {
        ws.data.currentSessionId = null;
        send(ws, { type: 'session:current', session: null });
        console.log(`⚙️ Profile changed (${oldProfile || 'Default'} → ${newProfile || 'Default'}), session cleared to apply new settings`);
      } else {
        console.log(`⚙️ Profile set to: ${newProfile || 'Default'}`);
      }
      break;
    }

    case 'session:delete':
      await handleSessionDelete(ws, event.sessionId);
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
      model: (ws.data as any).selectedModel || undefined,
      settingsProfile: (ws.data as any).settingsProfile || undefined,
      handlers: {
        onChunk: (chunk) => {
          send(ws, { type: 'message:chunk', content: chunk, id, sessionId: ws.data.currentSessionId || id });
        },
        onDone: async () => {
          send(ws, { type: 'message:done', id, sessionId: ws.data.currentSessionId || id });
          console.log(`✅ Message ${id} completed`);

          // Refresh session list and info after message completes
          try {
            const sessions = await listSessions(ws.data.workingDirectory!);
            const trimmedSessions = sessions.length > MAX_SESSIONS_PER_PROJECT
              ? sessions.slice(0, MAX_SESSIONS_PER_PROJECT)
              : sessions;
            send(ws, { type: 'session:list', sessions: trimmedSessions });
            console.log(`🔄 Refreshed session list (${trimmedSessions.length}/${sessions.length} sessions)`);

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
          send(ws, { type: 'message:error', error, id, sessionId: ws.data.currentSessionId || id });
          console.error(`❌ Message ${id} error:`, error);
        },
        onToolUse: (tool, input) => {
          send(ws, { type: 'terminal:output', content: `[${tool}] ${input}` });
          send(ws, { type: 'message:tool_use', id, toolName: tool, toolInput: input, sessionId: ws.data.currentSessionId || id });
        },
        onToolResult: (tool, result) => {
          console.log(`📡 Sending tool result for ${tool} (${result.length} chars)`);
          send(ws, { type: 'terminal:output', content: result });
        },
        onThinking: (isThinking) => {
          send(ws, { type: 'message:thinking', isThinking, sessionId: ws.data.currentSessionId || id });
        },
        onThinkingContent: (content) => {
          send(ws, { type: 'message:thinking_content', id, content, sessionId: ws.data.currentSessionId || id });
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
        onModelsLoaded: (models) => {
          send(ws, { type: 'models:list', models });
        },
        onAccountInfoLoaded: (_info) => {
          // Account info will be fetched via settings:get
        },
        onToolPermission: async (toolName, input, toolUseId) => {
          const requestId = crypto.randomUUID();
          send(ws, {
            type: 'tool:permission_request',
            requestId,
            tool: toolName,
            input,
            sessionId: ws.data.currentSessionId || '',
          });
          // Wait for user response
          return new Promise<{ allowed: boolean }>((resolve) => {
            pendingPermissions.set(requestId, resolve);
            // Auto-deny after 55 seconds
            setTimeout(() => {
              if (pendingPermissions.has(requestId)) {
                pendingPermissions.delete(requestId);
                resolve({ allowed: false });
              }
            }, 55000);
          });
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

async function handleFileWrite(ws: ServerWebSocket<WSData>, path: string, content: string) {
  console.log(`💾 Writing file: ${path} (workingDir: ${ws.data.workingDirectory})`);
  try {
    if (ws.data.workingDirectory && !isPathSafe(ws.data.workingDirectory, path)) {
      console.warn(`⚠️ Access denied: ${path} not within ${ws.data.workingDirectory}`);
      send(ws, { type: 'file:error', path, error: 'Access denied' });
      return;
    }

    await writeFileContent(path, content);
    console.log(`✅ File saved: ${path} (${content.length} chars)`);
    send(ws, { type: 'file:saved', path });
  } catch (error) {
    console.error(`❌ Failed to write file: ${path}`, error);
    send(ws, { type: 'file:error', path, error: `Failed to save file: ${path}` });
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
    // Trim to max sessions limit (sorted by modified date descending)
    const trimmedSessions = sessions.length > MAX_SESSIONS_PER_PROJECT
      ? sessions.slice(0, MAX_SESSIONS_PER_PROJECT)
      : sessions;
    send(ws, { type: 'session:list', sessions: trimmedSessions });
    console.log(`📋 Sent ${trimmedSessions.length}/${sessions.length} sessions for ${ws.data.workingDirectory}`);
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
  const trimmedSessions = sessions.length > MAX_SESSIONS_PER_PROJECT
    ? sessions.slice(0, MAX_SESSIONS_PER_PROJECT)
    : sessions;
  send(ws, { type: 'session:list', sessions: trimmedSessions });
  console.log(`🔄 Refreshed session list after switch (${trimmedSessions.length}/${sessions.length} sessions)`);

  // Find and send current session
  const currentSession = sessions.find((s) => s.id === sessionId);
  if (currentSession) {
    // Attach last used profile if exists
    const lastProfile = sessionLastProfile.get(sessionId);
    if (lastProfile) {
      currentSession.lastUsedProfile = lastProfile;
    }
    send(ws, { type: 'session:current', session: currentSession });
    console.log(`📋 Sent current session${lastProfile ? ` (profile: ${lastProfile})` : ''}`);
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

function handleTerminalReconnect(ws: ServerWebSocket<WSData>) {
  // Find any previous connection that has terminals and swap the WS reference
  // The new WS is `ws`; we look for terminals not owned by it
  for (const conn of activeConnections) {
    if (conn !== ws) {
      const sessions = listTerminals(conn);
      if (sessions.length > 0) {
        reconnectTerminal(conn, ws);
        console.log(`🔄 Reconnected ${sessions.length} terminals to new WebSocket`);
        break;
      }
    }
  }
  const sessions = listTerminals(ws);
  send(ws, { type: 'terminal:sessions', sessions });
}

async function handleBrowseList(ws: ServerWebSocket<WSData>, dirPath: string) {
  try {
    const { readdir, stat } = await import('fs/promises');
    const { join } = await import('path');
    const entries: { name: string; path: string; isDirectory: boolean; isGitRepo?: boolean }[] = [];

    // Add parent entry (go up)
    const parentPath = join(dirPath, '..');
    if (parentPath !== dirPath) {
      entries.push({ name: '..', path: parentPath, isDirectory: true });
    }

    const items = await readdir(dirPath, { withFileTypes: true });
    for (const item of items) {
      // Skip hidden files except common dev folders
      if (item.name.startsWith('.') && item.name !== '.git') continue;
      if (!item.isDirectory()) continue;
      if (item.name === 'node_modules' || item.name === '.git') continue;

      const fullPath = join(dirPath, item.name);
      // Check if it's a git repo
      let isGitRepo = false;
      try {
        await stat(join(fullPath, '.git'));
        isGitRepo = true;
      } catch { /* not a git repo */ }

      entries.push({ name: item.name, path: fullPath, isDirectory: true, isGitRepo });
    }

    // Sort: git repos first, then alphabetical
    entries.sort((a, b) => {
      if (a.name === '..') return -1;
      if (b.name === '..') return 1;
      if (a.isGitRepo && !b.isGitRepo) return -1;
      if (!a.isGitRepo && b.isGitRepo) return 1;
      return a.name.localeCompare(b.name);
    });

    send(ws, { type: 'browse:list', path: dirPath, entries });
  } catch {
    send(ws, { type: 'browse:list', path: dirPath, entries: [] });
  }
}

async function handleProfilesList(ws: ServerWebSocket<WSData>) {
  try {
    const profiles = await listSettingsProfiles();
    send(ws, { type: 'profiles:list', profiles });
  } catch {
    send(ws, { type: 'profiles:list', profiles: [{ name: 'Default', path: '', provider: 'Anthropic' }] });
  }
}

async function handleSettingsGet(ws: ServerWebSocket<WSData>) {
  try {
    // If no current session, find the most recent one for usage data
    let sessionIdForUsage = ws.data.currentSessionId;
    if (!sessionIdForUsage && ws.data.workingDirectory) {
      const allSessions = await listSessions(ws.data.workingDirectory);
      if (allSessions.length > 0) {
        sessionIdForUsage = allSessions[0].id; // sorted by modified desc
      }
    }

    const [providerInfo, mcpServers, claudeConfig, sessionInfo, usageQuota] = await Promise.all([
      getProviderInfo(ws.data.workingDirectory || undefined),
      getMcpServers(ws.data.workingDirectory || undefined),
      getClaudeConfig(),
      ws.data.workingDirectory && sessionIdForUsage
        ? getSessionInfo(ws.data.workingDirectory, sessionIdForUsage)
        : Promise.resolve(null),
      fetchUsageQuota(),
    ]);

    send(ws, {
      type: 'settings:info',
      provider: providerInfo.provider,
      permissionMode: providerInfo.permissionMode,
      model: sessionInfo?.model || providerInfo.model,
      models: providerInfo.models,
      mcpServers,
      claudeConfig,
      tokenUsage: sessionInfo?.usage || null,
      costInfo: providerInfo.costInfo || null,
      rateLimits: providerInfo.rateLimits || {},
      accountInfo: providerInfo.accountInfo || null,
      usageQuota: usageQuota || null,
      maxMessagesPerSession: 50,
      maxSessionsPerProject: 15,
    } as any);
    console.log(`⚙️ Sent settings info (${mcpServers.length} MCP servers, provider: ${providerInfo.provider})`);
  } catch (error) {
    console.error('Failed to get settings:', error);
    send(ws, { type: 'message:error', error: 'Failed to get settings', id: '' });
  }
}

// Models are loaded via piggyback on first user query — no separate preload needed

async function handleSessionDelete(ws: ServerWebSocket<WSData>, sessionId: string) {
  if (!ws.data.workingDirectory) return;
  const ok = await deleteSession(ws.data.workingDirectory, sessionId);
  if (ok) {
    // If deleting current session, clear it
    if (ws.data.currentSessionId === sessionId) {
      ws.data.currentSessionId = null;
      send(ws, { type: 'session:current', session: null });
    }
    // Refresh session list
    const sessions = await listSessions(ws.data.workingDirectory);
    const trimmedSessions = sessions.length > MAX_SESSIONS_PER_PROJECT
      ? sessions.slice(0, MAX_SESSIONS_PER_PROJECT)
      : sessions;
    send(ws, { type: 'session:list', sessions: trimmedSessions });
    console.log(`🗑️ Session deleted, refreshed list (${trimmedSessions.length}/${sessions.length} sessions)`);
  }
}

function handleModelSet(ws: ServerWebSocket<WSData>, model: string) {
  // Store on the connection so next query uses it
  (ws.data as any).selectedModel = model;
  console.log(`🔄 Model set to: ${model}`);
}

function send(ws: ServerWebSocket<WSData>, event: WSServerEvent) {
  ws.send(JSON.stringify(event));
}
