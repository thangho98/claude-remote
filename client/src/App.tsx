import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { useWebSocket } from './hooks/useWebSocket';
import { useIsDesktop } from './hooks/useIsDesktop';
import {
  useAppStore,
  useAuthStore,
  useConnectionStore,
  useProjectStore,
  useFileStore,
  useMessageStore,
  useLoadingStore,
  useTerminalSessionStore,
  useSessionStore,
  useUIStore,
  useGitStore,
  useBottomPanelStore,
} from './stores/appStore';
import { writeTerminalData } from './lib/terminalRegistry';
import { AuthScreen } from './components/AuthScreen';
import { Layout } from './components/Layout';
import { ChatPanel } from './components/ChatPanel';
import { FileExplorer } from './components/FileExplorer';
import { FileViewer } from './components/FileViewer';
import { TerminalPanel } from './components/TerminalPanel';
import { SessionPanel } from './components/SessionPanel';
import type { WSServerEvent, Message, Session } from '@shared/types';

const SourceControlPanel = lazy(() =>
  import('./components/SourceControlPanel').then((m) => ({ default: m.SourceControlPanel })),
);
const DiffViewer = lazy(() =>
  import('./components/DiffViewer').then((m) => ({ default: m.DiffViewer })),
);

function App() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const { token, setToken, authenticated, logout } = useAuthStore();
  const { isConnected, setConnected } = useConnectionStore();
  const { projects, currentProject, setCurrentProject } = useProjectStore();
  const { fileTree, selectedFile, setSelectedFile } = useFileStore();
  const { messages, addMessage, clearMessages } = useMessageStore();
  const { isLoading, setLoading, isThinking } = useLoadingStore();
  const { sessions, currentSession, setCurrentSession, setCurrentModel, tokenUsage, setTokenUsage } = useSessionStore();
  const { activeTab, setActiveTab, commands } = useUIStore();
  const { gitStatus, gitChanges, selectedDiff, setSelectedDiff } = useGitStore();
  const { bottomPanelTab, setBottomPanelTab } = useBottomPanelStore();
  const { terminalSessions, activeTerminalId, setActiveTerminalId } = useTerminalSessionStore();
  const isDesktop = useIsDesktop();

  // Handle incoming WebSocket messages
  // Note: Using ref pattern to avoid stale closures - handlerRef is updated on every render
  const handlerRef = useRef<(event: WSServerEvent) => void>(() => {}) as MutableRefObject<(event: WSServerEvent) => void>;
  
  const handleMessage = useCallback((event: WSServerEvent) => {
    // Always call the latest handler from ref
    handlerRef.current(event);
  }, []);
  
  // Update the actual handler implementation on every render
  handlerRef.current = (event: WSServerEvent) => {
    // Use getState() directly for fresh state - no stale closures
    const store = useAppStore.getState();
    const currentMessages = store.messages;

    switch (event.type) {
      case 'auth:success':
        store.setAuthenticated(true);
        setAuthError(null);
        setIsConnecting(false);
        break;

      case 'auth:error':
        setAuthError(event.message);
        store.setAuthenticated(false);
        setIsConnecting(false);
        break;

      case 'project:list':
        store.setProjects(event.projects);
        break;

      case 'project:current':
        store.setCurrentProject(event.project);
        break;

      case 'file:tree':
        store.setFileTree(event.tree);
        break;

      case 'file:content':
        store.setSelectedFile({ path: event.path, content: event.content });
        break;

      case 'message:append':
        store.upsertMessage(event.message);
        break;

      case 'message:chunk': {
        const existingMsg = currentMessages.find((m) => m.id === event.id);
        if (!existingMsg) {
          store.addMessage({
            id: event.id,
            role: 'assistant',
            content: event.content,
            timestamp: new Date().toISOString(),
            isStreaming: true,
          });
        } else {
          store.updateMessage(event.id, event.content);
        }
        break;
      }

      case 'message:tool_use': {
        let parsedInput: Record<string, unknown> = {};
        if (typeof event.toolInput === 'string' && event.toolInput) {
          try {
            parsedInput = JSON.parse(event.toolInput);
          } catch {
            parsedInput = { raw: event.toolInput };
          }
        }

        const existingMsg = currentMessages.find((m) => m.id === event.id);
        if (!existingMsg) {
          store.addMessage({
            id: event.id,
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: `${event.id}-${event.toolName}`,
                name: event.toolName,
                input: parsedInput,
              },
            ],
            timestamp: new Date().toISOString(),
            isStreaming: true,
          });
        } else {
          store.addToolUseToMessage(event.id, event.toolName, event.toolInput);
        }
        break;
      }

      case 'message:done':
        store.setMessageDone(event.id);
        store.setLoading(false);
        store.setThinking(false);
        break;

      case 'message:error':
        store.setLoading(false);
        store.setThinking(false);
        store.addMessage({
          id: event.id || uuidv7(),
          role: 'assistant',
          content: `Error: ${event.error}`,
          timestamp: new Date().toISOString(),
        });
        break;

      case 'message:thinking':
        store.setThinking(event.isThinking);
        break;

      case 'message:thinking_content': {
        const existingMsg = currentMessages.find((m) => m.id === event.id);
        if (!existingMsg) {
          store.addMessage({
            id: event.id,
            role: 'assistant',
            content: [{ type: 'thinking', thinking: event.content }],
            timestamp: new Date().toISOString(),
            isStreaming: true,
          });
        } else {
          store.addThinkingToMessage(event.id, event.content);
        }
        break;
      }

      case 'terminal:output':
        store.addTerminalOutput(event.content);
        break;

      case 'session:list':
        store.setSessions(event.sessions);
        break;

      case 'session:current':
        store.setCurrentSession(event.session);
        break;

      case 'session:info':
        store.setCurrentModel(event.model);
        store.setTokenUsage(event.usage);
        break;

      case 'session:messages':
        store.setMessages(event.messages);
        break;

      case 'session:id':
        console.log(`📋 New session ID: ${event.sessionId}`);
        break;

      case 'commands:list':
        store.setCommands(event.commands);
        break;

      case 'git:status':
        store.setGitStatus(event.status);
        break;

      case 'git:changes':
        store.setGitChanges(event.changes);
        break;

      case 'git:diff':
        store.setSelectedDiff(event.diff);
        break;

      case 'git:error':
        console.error('Git error:', event.error);
        break;

      case 'terminal:created':
        store.addTerminalSession(event.session);
        break;

      case 'terminal:data':
        writeTerminalData(event.id, event.data);
        break;

      case 'terminal:closed':
        store.removeTerminalSession(event.id);
        break;

      case 'terminal:error':
        break;
    }
  };

  const {
    error: wsError,
    connectionState,
    reconnectAttempts,
    connect,
    disconnect,
    reconnect,
    send,
  } = useWebSocket({
    token: token || '',
    onMessage: handleMessage,
    onConnect: () => {
      setConnected(true);
    },
    onDisconnect: () => {
      setConnected(false);
    },
  });

  // Handle authentication
  const handleAuth = useCallback((newToken: string) => {
    setToken(newToken);
    setIsConnecting(true);
    setAuthError(null);
    connect(newToken);
  }, [setToken, connect]);

  // Handle logout
  const handleLogout = useCallback(() => {
    disconnect();
    logout();
  }, [disconnect, logout]);

  // Handle project selection
  const handleProjectSelect = useCallback((project: typeof currentProject) => {
    if (project) {
      setCurrentProject(project);
      send({ type: 'project:switch', path: project.path });
      send({ type: 'commands:list' });
    }
  }, [setCurrentProject, send]);

  // Handle session selection
  const handleSessionSelect = useCallback((sessionId: string) => {
    send({ type: 'session:switch', sessionId });
  }, [send]);

  // Stable callback for mobile session modal (avoids recreating on every render)
  const handleSessionSelectFromSession = useCallback(
    (session: Session) => handleSessionSelect(session.id),
    [handleSessionSelect],
  );

  // Handle new session
  const handleNewSession = useCallback(() => {
    setCurrentSession(null);
    setCurrentModel(null);
    setTokenUsage(null);
    clearMessages();
    send({ type: 'session:new' });
  }, [setCurrentSession, setCurrentModel, setTokenUsage, clearMessages, send]);

  // Handle file selection
  const handleFileSelect = useCallback((path: string) => {
    send({ type: 'file:read', path });
    if (window.innerWidth < 1024) {
      setActiveTab('file');
    }
  }, [send, setActiveTab]);

  // Handle sending messages
  const handleSendMessage = useCallback((content: string) => {
    console.log('📤 handleSendMessage called:', content.slice(0, 50));

    if (!isConnected) {
      console.error('❌ Not connected to server');
      addMessage({
        id: uuidv7(),
        role: 'assistant',
        content: 'Error: Not connected to server. Please refresh the page.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const userMessage: Message = {
      id: uuidv7(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    addMessage(userMessage);
    setLoading(true);

    const sent = send({ type: 'message', content });
    if (!sent) {
      console.error('❌ Failed to send message');
      setLoading(false);
      addMessage({
        id: uuidv7(),
        role: 'assistant',
        content: 'Error: Failed to send message. Please check your connection.',
        timestamp: new Date().toISOString(),
      });
    }
  }, [isConnected, addMessage, setLoading, send]);

  // Handle git refresh
  const handleGitRefresh = useCallback(() => {
    send({ type: 'git:status' });
  }, [send]);

  // Handle git diff selection
  const handleGitDiffSelect = useCallback((path: string) => {
    send({ type: 'git:diff', path });
  }, [send]);

  // Refs for stable callbacks
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // Terminal callbacks - use refs to avoid stale closures
  const handleCreateTerminal = useCallback(() => {
    // Default dimensions based on device type to prevent prompt wrapping issues (cursor jumping)
    // Mobile width (375px) typically fits ~40 cols with standard font size
    const cols = isDesktop ? 80 : 40; 
    const rows = isDesktop ? 24 : 20;
    sendRef.current({ type: 'terminal:create', id: crypto.randomUUID(), cols, rows });
  }, [isDesktop]);

  const handleCloseTerminal = useCallback((id: string) => {
    sendRef.current({ type: 'terminal:close', id });
  }, []);

  const handleTerminalInput = useCallback((id: string, base64Data: string) => {
    sendRef.current({ type: 'terminal:input', id, data: base64Data });
  }, []);

  const handleTerminalResize = useCallback((id: string, cols: number, rows: number) => {
    sendRef.current({ type: 'terminal:resize', id, cols, rows });
  }, []);

  // Auto-connect if we have a stored token
  useEffect(() => {
    if (token && !isConnected && !isConnecting && !authenticated) {
      setIsConnecting(true);
      connect(token);

      const timeout = setTimeout(() => {
        if (!authenticated) {
          setIsConnecting(false);
          setAuthError('Connection timeout. Please try again.');
        }
      }, 10000);

      return () => {
        clearTimeout(timeout);
      };
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync project and sessions after authentication
  // Use currentProject?.path (string) as dep instead of currentProject (object)
  // to avoid infinite loop: project:switch → server sends new project:current object →
  // currentProject ref changes → effect fires again → project:switch again
  const currentProjectPath = currentProject?.path;
  useEffect(() => {
    if (authenticated && isConnected) {
      send({ type: 'commands:list' });

      if (currentProjectPath) {
        send({ type: 'project:switch', path: currentProjectPath });
      }
    }
  }, [authenticated, isConnected, currentProjectPath, send]);

  // Show auth screen if not authenticated
  if (!token || !authenticated) {
    return (
      <AuthScreen
        onAuth={handleAuth}
        error={authError || wsError}
        isConnecting={isConnecting}
        hasStoredToken={!!token}
      />
    );
  }

  // Main app
  return (
    <Layout
      projects={projects}
      currentProject={currentProject}
      onProjectSelect={handleProjectSelect}
      isConnected={isConnected}
      onLogout={handleLogout}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      hasOpenFile={!!selectedFile}
      gitChangeCount={gitChanges.length}
      sidebar={
        <FileExplorer tree={fileTree} onFileSelect={handleFileSelect} selectedPath={selectedFile?.path} />
      }
      connectionState={connectionState}
      reconnectAttempts={reconnectAttempts}
      onReconnect={reconnect}
    >
      {/* Desktop: VS Code-like layout */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* Center: File content + Terminal */}
        <div className="flex-1 flex flex-col border-r border-gray-700">
          {/* File content area */}
          <div className="flex-1 overflow-hidden">
            {selectedDiff ? (
              <Suspense fallback={<div className="h-full flex items-center justify-center text-gray-500">Loading diff...</div>}>
                <DiffViewer
                  diff={selectedDiff}
                  onClose={() => setSelectedDiff(null)}
                />
              </Suspense>
            ) : selectedFile ? (
              <FileViewer
                path={selectedFile.path}
                content={selectedFile.content}
                onClose={() => setSelectedFile(null)}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
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
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p>Select a file to view</p>
                </div>
              </div>
            )}
          </div>
          {/* Bottom panel with tabs */}
          <div className="h-48 border-t border-gray-700 flex flex-col">
            {/* Tab bar */}
            <div className="flex items-center bg-gray-800 border-b border-gray-700 px-2 shrink-0">
              <button
                onClick={() => setBottomPanelTab('terminal')}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                  bottomPanelTab === 'terminal'
                    ? 'text-orange-400 border-orange-400'
                    : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}
              >
                Terminal
              </button>
              <button
                onClick={() => setBottomPanelTab('git')}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  bottomPanelTab === 'git'
                    ? 'text-orange-400 border-orange-400'
                    : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}
              >
                Source Control
                {gitChanges.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-orange-600 text-white leading-none">
                    {gitChanges.length}
                  </span>
                )}
              </button>
            </div>
            {/* Panel content - TerminalPanel always mounted to keep ref alive for streaming data */}
            <div className="flex-1 overflow-hidden relative">
              <div className="absolute inset-0" style={{ display: bottomPanelTab === 'terminal' ? 'block' : 'none' }}>
                {isDesktop && (
                  <TerminalPanel
                    terminalSessions={terminalSessions}
                    activeTerminalId={activeTerminalId}
                    onSetActiveTerminal={setActiveTerminalId}
                    onCreateTerminal={handleCreateTerminal}
                    onCloseTerminal={handleCloseTerminal}
                    onTerminalInput={handleTerminalInput}
                    onTerminalResize={handleTerminalResize}
                  />
                )}
              </div>
              {bottomPanelTab === 'git' && (
                <Suspense fallback={<div className="h-full flex items-center justify-center text-gray-500 text-sm">Loading...</div>}>
                  <SourceControlPanel
                    gitStatus={gitStatus}
                    gitChanges={gitChanges}
                    onDiffSelect={handleGitDiffSelect}
                    onRefresh={handleGitRefresh}
                    selectedDiffPath={selectedDiff?.path}
                  />
                </Suspense>
              )}
            </div>
          </div>
        </div>

        {/* Right: Session list + Chat */}
        <div className="w-[480px] flex flex-col">
          {/* Session panel at top */}
          <div className="border-b border-gray-700">
            <SessionPanel
              sessions={sessions}
              currentSession={currentSession}
              onSessionSelect={handleSessionSelect}
              onNewSession={handleNewSession}
            />
          </div>
          {/* Chat at bottom */}
          <div className="flex-1 overflow-hidden">
            <ChatPanel
              messages={messages}
              onSend={handleSendMessage}
              isLoading={isLoading}
              isThinking={isThinking}
              currentFile={selectedFile?.path}
              tokenUsage={tokenUsage}
              commands={commands}
            />
          </div>
        </div>
      </div>

      {/* Mobile: Tab-based navigation */}
      <div className="lg:hidden flex-1 overflow-hidden">
        {activeTab === 'chat' && (
          <ChatPanel
            messages={messages}
            onSend={handleSendMessage}
            isLoading={isLoading}
            isThinking={isThinking}
            currentFile={selectedFile?.path}
            tokenUsage={tokenUsage}
            commands={commands}
            // Session selector in mobile chat
            showSessionSelector
            sessions={sessions}
            currentSession={currentSession}
            onSessionSelect={handleSessionSelectFromSession}
            onNewSession={handleNewSession}
          />
        )}
        {activeTab === 'file' &&
          (selectedFile ? (
            <FileViewer
              path={selectedFile.path}
              content={selectedFile.content}
              onClose={() => setSelectedFile(null)}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center p-6">
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
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="mb-2">No file open</p>
                <p className="text-sm text-gray-600">Select a file from the Files tab</p>
              </div>
            </div>
          ))}
        {activeTab === 'files' && (
          <div className="h-full overflow-y-auto">
            <FileExplorer tree={fileTree} onFileSelect={handleFileSelect} selectedPath={selectedFile?.path} />
          </div>
        )}
        {/* Terminal always mounted on mobile for data streaming */}
        <div className="h-full" style={{ display: activeTab === 'terminal' ? 'block' : 'none' }}>
          {!isDesktop && (
            <TerminalPanel
              terminalSessions={terminalSessions}
              activeTerminalId={activeTerminalId}
              onSetActiveTerminal={setActiveTerminalId}
              onCreateTerminal={handleCreateTerminal}
              onCloseTerminal={handleCloseTerminal}
              onTerminalInput={handleTerminalInput}
              onTerminalResize={handleTerminalResize}
            />
          )}
        </div>
        {activeTab === 'git' && (
          <Suspense fallback={<div className="h-full flex items-center justify-center text-gray-500 text-sm">Loading...</div>}>
            <div className="h-full flex flex-col">
              {selectedDiff ? (
                <DiffViewer
                  diff={selectedDiff}
                  onClose={() => setSelectedDiff(null)}
                />
              ) : (
                <SourceControlPanel
                  gitStatus={gitStatus}
                  gitChanges={gitChanges}
                  onDiffSelect={handleGitDiffSelect}
                  onRefresh={handleGitRefresh}
                />
              )}
            </div>
          </Suspense>
        )}
      </div>
    </Layout>
  );
}

export default App;
