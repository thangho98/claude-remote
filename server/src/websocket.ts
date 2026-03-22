import type { ServerWebSocket } from 'bun';
import type { Message, Session, WSClientEvent, WSServerEvent } from '../../shared/types';
import { getFileTree, readFileContent, writeFileContent, isPathSafe } from './services/file';
import { listProjects } from './services/project';
import { listSessions, getSessionInfo, getSessionMessages, deleteSession } from './services/session';
import { deleteCodexSession, getCodexSessionInfo, getCodexSessionMessages, listCodexSessions } from './services/codexSession';
import { listCommands } from './services/commands';
import { isGitRepo, getGitStatus, getGitChanges, getGitDiff } from './services/git';
import {
  PROVIDER_LABELS,
  ClaudeSdkProvider,
  ensureProviderAvailable,
  getClaudeProvider,
  getDefaultProviderSelection,
  getProviderAvailability,
} from './claude/providers';
import { getOrCreateSession } from './claude/session';
import type { ChatProviderType, ProviderInterfaceType, ProviderSelection } from './claude/types';
import { subscribeToRoom, unsubscribeAll, getSubscribedRooms } from './rooms';
import { createTerminal, writeToTerminal, resizeTerminal, closeTerminal, closeAllTerminals, closeTerminalsByDirectory, reconnectTerminal, listTerminals } from './services/terminal';
import { getProviderSettingsSummary, listSettingsProfiles } from './services/settings';

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
  selectedProvider: ChatProviderType;
  selectedInterfaces: Record<ChatProviderType, ProviderInterfaceType>;
  selectedModels: Partial<Record<ChatProviderType, string>>;
  settingsProfiles: Partial<Record<ChatProviderType, string>>;
  // Runtime settings per provider
  permissionModes: Partial<Record<ChatProviderType, string>>;
  effortLevel: string;
  reasoningLevel: string;
  speedLevel: string;
}

function isProvider(value: string | undefined | null): value is ChatProviderType {
  return value === 'claude' || value === 'codex';
}

function getDefaultInterfaces(): Record<ChatProviderType, ProviderInterfaceType> {
  const defaultSelection = getDefaultProviderSelection();

  return {
    claude: defaultSelection.provider === 'claude' ? defaultSelection.interface : 'sdk',
    codex: defaultSelection.provider === 'codex' ? defaultSelection.interface : 'sdk',
  };
}

export function getDefaultProviderType(): ChatProviderType {
  return getDefaultProviderSelection().provider;
}

function getSelectedProvider(ws: ServerWebSocket<WSData>): ChatProviderType {
  return ws.data.selectedProvider || getDefaultProviderType();
}

function getSelectedInterface(
  ws: ServerWebSocket<WSData>,
  providerType: ChatProviderType = getSelectedProvider(ws),
): ProviderInterfaceType {
  return ws.data.selectedInterfaces?.[providerType] || getDefaultInterfaces()[providerType];
}

function getProviderSelection(
  ws: ServerWebSocket<WSData>,
  providerType: ChatProviderType = getSelectedProvider(ws),
): ProviderSelection {
  return {
    provider: providerType,
    interface: getSelectedInterface(ws, providerType),
  };
}

function getSelectedModel(
  ws: ServerWebSocket<WSData>,
  providerType: ChatProviderType = getSelectedProvider(ws),
): string | null {
  return ws.data.selectedModels?.[providerType] || null;
}

function getSelectedProfile(
  ws: ServerWebSocket<WSData>,
  providerType: ChatProviderType = getSelectedProvider(ws),
): string | null {
  return ws.data.settingsProfiles?.[providerType] || null;
}

async function getUsableSelection(
  ws: ServerWebSocket<WSData>,
  providerType: ChatProviderType = getSelectedProvider(ws),
): Promise<ProviderSelection> {
  const selection = getProviderSelection(ws, providerType);
  const availability = await getProviderAvailability();

  if (availability[providerType][selection.interface]) {
    return selection;
  }

  const fallbackInterface = (['sdk', 'cli'] as const).find((value) => availability[providerType][value]);
  if (!fallbackInterface) {
    throw new Error(`${PROVIDER_LABELS[providerType]} is not available.`);
  }

  if (fallbackInterface !== selection.interface) {
    ws.data.selectedInterfaces[providerType] = fallbackInterface;
    console.warn(`⚠️ Falling back to ${PROVIDER_LABELS[providerType]} ${fallbackInterface.toUpperCase()}`);
  }

  return {
    provider: providerType,
    interface: fallbackInterface,
  };
}

async function listSessionsForProvider(
  providerType: ChatProviderType,
  projectPath: string,
) {
  return providerType === 'codex'
    ? listCodexSessions(projectPath)
    : listSessions(projectPath);
}

async function getSessionInfoForProvider(
  providerType: ChatProviderType,
  projectPath: string,
  sessionId: string,
) {
  return providerType === 'codex'
    ? getCodexSessionInfo(sessionId)
    : getSessionInfo(projectPath, sessionId);
}

async function getSessionMessagesForProvider(
  providerType: ChatProviderType,
  projectPath: string,
  sessionId: string,
) {
  return providerType === 'codex'
    ? getCodexSessionMessages(sessionId)
    : getSessionMessages(projectPath, sessionId);
}

async function deleteSessionForProvider(
  providerType: ChatProviderType,
  projectPath: string,
  sessionId: string,
) {
  return providerType === 'codex'
    ? deleteCodexSession(sessionId)
    : deleteSession(projectPath, sessionId);
}

async function listAllSessionsForProject(projectPath: string): Promise<Session[]> {
  const [claudeSessions, codexSessions] = await Promise.all([
    listSessions(projectPath).catch(() => []),
    listCodexSessions(projectPath).catch(() => []),
  ]);

  return [...claudeSessions, ...codexSessions].sort(
    (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime(),
  );
}

async function findProjectSession(projectPath: string, sessionId: string): Promise<Session | null> {
  const sessions = await listAllSessionsForProject(projectPath);
  return sessions.find((session) => session.id === sessionId) || null;
}

function mapSessionMessages(
  sessionId: string,
  rawMessages: Array<{ role: string; content: Message['content']; timestamp: string }>,
): Message[] {
  return rawMessages.map((message, index) => ({
    id: `${sessionId}-${index}`,
    role: message.role as 'user' | 'assistant',
    content: message.content,
    timestamp: message.timestamp,
    sessionId,
  }));
}

async function sendSessionsForProject(ws: ServerWebSocket<WSData>) {
  if (!ws.data.workingDirectory) {
    send(ws, { type: 'session:list', sessions: [] });
    return;
  }

  const sessions = await listAllSessionsForProject(ws.data.workingDirectory);
  const trimmedSessions = sessions.length > MAX_SESSIONS_PER_PROJECT
    ? sessions.slice(0, MAX_SESSIONS_PER_PROJECT)
    : sessions;
  send(ws, { type: 'session:list', sessions: trimmedSessions });
  console.log(`📋 Sent ${trimmedSessions.length}/${sessions.length} combined sessions for ${ws.data.workingDirectory}`);
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

    case 'provider:set':
      await handleProviderSet(ws, event.provider);
      break;

    case 'interface:set':
      await handleInterfaceSet(ws, event.provider, event.interface);
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
        await sendSessionsForProject(ws);
        await handleCommandsList(ws);

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
      await handleSessionNew(ws, event.provider);
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

    case 'permission:set': {
      const provider = event.provider === 'codex' ? 'codex' as const : 'claude' as const;
      ws.data.permissionModes[provider] = event.mode;
      console.log(`🔒 Permission mode for ${provider} set to: ${event.mode}`);

      // Wire into Claude SDK provider if applicable
      if (provider === 'claude') {
        try {
          const selection = await getUsableSelection(ws, 'claude');
          const providerInstance = await getClaudeProvider(selection);
          if (providerInstance instanceof ClaudeSdkProvider) {
            const sdkMode = event.mode === 'bypass' ? 'bypassPermissions'
              : event.mode === 'plan' ? 'plan'
              : event.mode === 'auto' ? 'acceptEdits'
              : 'default';
            providerInstance.setPermissionMode(sdkMode as any);
          }
        } catch { /* provider not available */ }
      }
      await handleSettingsGet(ws);
      break;
    }

    case 'effort:set':
      ws.data.effortLevel = event.level;
      console.log(`⚡ Effort level set to: ${event.level}`);
      break;

    case 'reasoning:set':
      ws.data.reasoningLevel = event.level;
      console.log(`🧠 Reasoning level set to: ${event.level}`);
      break;

    case 'speed:set':
      ws.data.speedLevel = event.level;
      console.log(`🚀 Speed level set to: ${event.level}`);
      break;

    case 'profiles:list':
      await handleProfilesList(ws);
      break;

    case 'browse:list':
      await handleBrowseList(ws, event.path);
      break;

    case 'profile:set': {
      const activeProvider = getSelectedProvider(ws);
      const oldProfile = getSelectedProfile(ws, activeProvider) || undefined;
      const newProfile = event.profilePath || undefined;
      if (newProfile) {
        ws.data.settingsProfiles[activeProvider] = newProfile;
      } else {
        delete ws.data.settingsProfiles[activeProvider];
      }

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
      await handleSettingsGet(ws);
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
  const selection = await getUsableSelection(ws);
  const providerType = selection.provider;
  let activeSessionId = sessionId;

  console.log(
    `💬 Message received in ${session.workingDirectory} via ${selection.provider}/${selection.interface}: "${content.slice(0, 50)}..."${sessionId ? ` (resuming session ${sessionId})` : ''}`,
  );

  try {
    const provider = await getClaudeProvider(selection);
    await provider.query({
      prompt: content,
      workingDirectory: session.workingDirectory,
      sessionId,
      model: getSelectedModel(ws, providerType) || undefined,
      settingsProfile: getSelectedProfile(ws, providerType) || undefined,
      // Only pass provider-relevant settings
      ...(providerType === 'claude'
        ? { effortLevel: ws.data.effortLevel }
        : { reasoningLevel: ws.data.reasoningLevel, speedLevel: ws.data.speedLevel }),
      handlers: {
        onChunk: (chunk) => {
          send(ws, { type: 'message:chunk', content: chunk, id, sessionId: activeSessionId || id });
        },
        onDone: async () => {
          send(ws, { type: 'message:done', id, sessionId: activeSessionId || id });
          console.log(`✅ Message ${id} completed`);

          // Refresh session list and info after message completes
          try {
            await sendSessionsForProject(ws);

            // Update session info (model + token usage)
            if (activeSessionId) {
              const info = await getSessionInfoForProvider(providerType, ws.data.workingDirectory!, activeSessionId);
              if (info) {
                send(ws, { type: 'session:info', model: info.model, usage: info.usage });
              }
            }
          } catch (error) {
            console.error('Failed to refresh sessions:', error);
          }
        },
        onError: (error) => {
          send(ws, { type: 'message:error', error, id, sessionId: activeSessionId || id });
          console.error(`❌ Message ${id} error:`, error);
        },
        onToolUse: (tool, input) => {
          send(ws, { type: 'terminal:output', content: `[${tool}] ${input}` });
          send(ws, { type: 'message:tool_use', id, toolName: tool, toolInput: input, sessionId: activeSessionId || id });
        },
        onToolResult: (tool, result) => {
          console.log(`📡 Sending tool result for ${tool} (${result.length} chars)`);
          send(ws, { type: 'terminal:output', content: result });
        },
        onThinking: (isThinking) => {
          send(ws, { type: 'message:thinking', isThinking, sessionId: activeSessionId || id });
        },
        onThinkingContent: (content) => {
          send(ws, { type: 'message:thinking_content', id, content, sessionId: activeSessionId || id });
        },
        onSessionId: async (newSessionId) => {
          activeSessionId = newSessionId;
          ws.data.currentSessionId = newSessionId;
          send(ws, { type: 'session:id', sessionId: newSessionId });
          console.log(`📋 Updated current session: ${newSessionId}`);

          // Send session info (model + token usage) for new session
          const info = await getSessionInfoForProvider(providerType, ws.data.workingDirectory!, newSessionId);
          if (info) {
            send(ws, { type: 'session:info', model: info.model, usage: info.usage });
          }
        },
        onMessage: (message) => {
          send(ws, { type: 'message:append', message, sessionId: activeSessionId || id });
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
            sessionId: activeSessionId || '',
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
    await sendSessionsForProject(ws);
  } catch (error) {
    console.error('Failed to list sessions:', error);
    send(ws, { type: 'session:list', sessions: [] });
  }
}

async function handleSessionNew(ws: ServerWebSocket<WSData>, providerType?: ChatProviderType) {
  if (providerType && providerType !== ws.data.selectedProvider) {
    try {
      await getUsableSelection(ws, providerType);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Selected provider is not available';
      send(ws, { type: 'message:error', error: errorMessage, id: '' });
      return;
    }

    ws.data.selectedProvider = providerType;
    await handleProfilesList(ws);
    await handleSettingsGet(ws);
    await handleCommandsList(ws);

    if (ws.data.workingDirectory) {
      await sendSessionsForProject(ws);
    }
  }

  ws.data.currentSessionId = null;
  console.log('🆕 Cleared session ID for new session');
  send(ws, { type: 'session:current', session: null });
}

async function handleSessionSwitch(ws: ServerWebSocket<WSData>, sessionId: string) {
  if (!ws.data.workingDirectory) {
    return;
  }

  const targetSession = await findProjectSession(ws.data.workingDirectory, sessionId);
  const providerType = targetSession?.provider || getSelectedProvider(ws);
  const didProviderChange = ws.data.selectedProvider !== providerType;

  if (didProviderChange) {
    ws.data.selectedProvider = providerType;
    await handleProfilesList(ws);
    await handleSettingsGet(ws);
    await handleCommandsList(ws);
  }

  ws.data.currentSessionId = sessionId;
  console.log(`🔄 Switched to ${providerType} session: ${sessionId}`);

  // Subscribe to session room
  subscribeToRoom(ws, 'session', sessionId);

  // Get session info and send it
  const info = await getSessionInfoForProvider(providerType, ws.data.workingDirectory, sessionId);
  if (info) {
    send(ws, { type: 'session:info', model: info.model, usage: info.usage });
  }

  // Refresh and send session list
  const sessions = await listAllSessionsForProject(ws.data.workingDirectory);
  const trimmedSessions = sessions.length > MAX_SESSIONS_PER_PROJECT
    ? sessions.slice(0, MAX_SESSIONS_PER_PROJECT)
    : sessions;
  send(ws, { type: 'session:list', sessions: trimmedSessions });
  console.log(`🔄 Refreshed combined session list after switch (${trimmedSessions.length}/${sessions.length} sessions)`);

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
  const rawMessages = await getSessionMessagesForProvider(providerType, ws.data.workingDirectory, sessionId);
  const messages = mapSessionMessages(sessionId, rawMessages);
  send(ws, { type: 'session:messages', messages });
  console.log(`📨 Sent ${messages.length} messages for session ${sessionId}`);
}

async function handleCommandsList(ws: ServerWebSocket<WSData>) {
  try {
    const providerType = getSelectedProvider(ws);
    const commands = await listCommands(providerType, ws.data.workingDirectory || undefined);
    send(ws, { type: 'commands:list', commands });
    console.log(`📋 Sent ${commands.length} commands for ${providerType}`);
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

async function handleProviderSet(ws: ServerWebSocket<WSData>, providerType: ChatProviderType) {
  try {
    await getUsableSelection(ws, providerType);
    ws.data.selectedProvider = providerType;
    ws.data.currentSessionId = null;

    send(ws, { type: 'session:current', session: null });

    if (ws.data.workingDirectory) {
      await sendSessionsForProject(ws);
    } else {
      send(ws, { type: 'session:list', sessions: [] });
    }

    await handleProfilesList(ws);
    await handleSettingsGet(ws);
    await handleCommandsList(ws);
    console.log(`🔄 Active provider set to ${providerType}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to switch provider';
    console.error(`Failed to switch provider to ${providerType}:`, error);
    send(ws, { type: 'message:error', error: errorMessage, id: '' });
  }
}

async function handleInterfaceSet(
  ws: ServerWebSocket<WSData>,
  providerType: ChatProviderType,
  interfaceType: ProviderInterfaceType,
) {
  try {
    await ensureProviderAvailable({ provider: providerType, interface: interfaceType });
    ws.data.selectedInterfaces[providerType] = interfaceType;

    if (ws.data.selectedProvider === providerType) {
      ws.data.currentSessionId = null;
      send(ws, { type: 'session:current', session: null });
      await handleProfilesList(ws);
    }

    await handleSettingsGet(ws);
    console.log(`🔄 Interface for ${providerType} set to ${interfaceType}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to switch interface';
    console.error(`Failed to switch interface for ${providerType} to ${interfaceType}:`, error);
    send(ws, { type: 'message:error', error: errorMessage, id: '' });
  }
}

async function handleProfilesList(ws: ServerWebSocket<WSData>) {
  const selection = await getUsableSelection(ws);
  try {
    const profiles = await listSettingsProfiles(selection);
    send(ws, { type: 'profiles:list', profiles });
  } catch {
    send(ws, {
      type: 'profiles:list',
      profiles: [{ name: 'Default', path: '', provider: selection.provider === 'codex' ? 'OpenAI' : 'Anthropic' }],
    });
  }
}

async function handleSettingsGet(ws: ServerWebSocket<WSData>) {
  try {
    const providerType = getSelectedProvider(ws);
    const selection = await getUsableSelection(ws, providerType);
    // If no current session, find the most recent one for usage data
    let sessionIdForUsage = ws.data.currentSessionId;
    if (!sessionIdForUsage && ws.data.workingDirectory) {
      const allSessions = await listSessionsForProvider(providerType, ws.data.workingDirectory);
      if (allSessions.length > 0) {
        sessionIdForUsage = allSessions[0].id; // sorted by modified desc
      }
    }

    const providerSummaries = await Promise.all([
      getProviderSettingsSummary({
        selection: {
          provider: 'claude',
          interface: getSelectedInterface(ws, 'claude'),
        },
        workingDirectory: ws.data.workingDirectory || undefined,
        sessionId: providerType === 'claude' ? sessionIdForUsage : null,
        selectedModel: getSelectedModel(ws, 'claude'),
        activeProvider: providerType,
      }),
      getProviderSettingsSummary({
        selection: {
          provider: 'codex',
          interface: getSelectedInterface(ws, 'codex'),
        },
        workingDirectory: ws.data.workingDirectory || undefined,
        sessionId: providerType === 'codex' ? sessionIdForUsage : null,
        selectedModel: getSelectedModel(ws, 'codex'),
        activeProvider: providerType,
      }),
    ]);

    const activeSummary = providerSummaries.find((summary) => summary.provider === providerType);
    if (!activeSummary) {
      throw new Error(`Missing settings summary for ${providerType}`);
    }

    send(ws, {
      type: 'settings:info',
      provider: providerType,
      interface: selection.interface,
      providers: providerSummaries,
      permissionMode: activeSummary.permissionMode,
      model: activeSummary.model,
      models: activeSummary.models,
      mcpServers: activeSummary.mcpServers,
      claudeConfig: activeSummary.claudeConfig,
      tokenUsage: activeSummary.tokenUsage,
      costInfo: activeSummary.costInfo || null,
      rateLimits: activeSummary.rateLimits || {},
      accountInfo: activeSummary.accountInfo || null,
      usageQuota: activeSummary.usageQuota || null,
      maxMessagesPerSession: 50,
      maxSessionsPerProject: 15,
    });
    console.log(`⚙️ Sent settings info (${activeSummary.mcpServers.length} MCP servers, provider: ${providerType}/${selection.interface})`);
  } catch (error) {
    console.error('Failed to get settings:', error);
    send(ws, { type: 'message:error', error: 'Failed to get settings', id: '' });
  }
}

// Models are loaded via piggyback on first user query — no separate preload needed

async function handleSessionDelete(ws: ServerWebSocket<WSData>, sessionId: string) {
  if (!ws.data.workingDirectory) return;
  const targetSession = await findProjectSession(ws.data.workingDirectory, sessionId);
  const providerType = targetSession?.provider || getSelectedProvider(ws);
  const ok = await deleteSessionForProvider(providerType, ws.data.workingDirectory, sessionId);
  if (ok) {
    // If deleting current session, clear it
    if (ws.data.currentSessionId === sessionId) {
      ws.data.currentSessionId = null;
      send(ws, { type: 'session:current', session: null });
    }
    // Refresh session list
    const sessions = await listAllSessionsForProject(ws.data.workingDirectory);
    const trimmedSessions = sessions.length > MAX_SESSIONS_PER_PROJECT
      ? sessions.slice(0, MAX_SESSIONS_PER_PROJECT)
      : sessions;
    send(ws, { type: 'session:list', sessions: trimmedSessions });
    console.log(`🗑️ ${providerType} session deleted, refreshed combined list (${trimmedSessions.length}/${sessions.length} sessions)`);
  }
}

function handleModelSet(ws: ServerWebSocket<WSData>, model: string) {
  // Store on the connection so next query uses it
  const providerType = getSelectedProvider(ws);
  ws.data.selectedModels[providerType] = model;
  console.log(`🔄 Model for ${providerType} set to: ${model}`);
}

function send(ws: ServerWebSocket<WSData>, event: WSServerEvent) {
  ws.send(JSON.stringify(event));
}
