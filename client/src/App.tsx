import { useCallback, useEffect, useState } from "react";
import { v7 as uuidv7 } from "uuid";
import { useWebSocket } from "./hooks/useWebSocket";
import { useAppStore } from "./stores/appStore";
import { AuthScreen } from "./components/AuthScreen";
import { Layout } from "./components/Layout";
import { ChatPanel } from "./components/ChatPanel";
import { FileExplorer } from "./components/FileExplorer";
import { FileViewer } from "./components/FileViewer";
import { TerminalOutput } from "./components/TerminalOutput";
import { SessionPanel } from "./components/SessionPanel";
import type { WSServerEvent, Message } from "@shared/types";

function App() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    token,
    setToken,
    authenticated,
    setAuthenticated,
    isConnected,
    setConnected,
    messages,
    setMessages,
    addMessage,
    updateMessage,
    addToolUseToMessage,
    setMessageDone,
    isLoading,
    setLoading,
    isThinking,
    setThinking,
    projects,
    setProjects,
    currentProject,
    setCurrentProject,
    fileTree,
    setFileTree,
    selectedFile,
    setSelectedFile,
    terminalOutput,
    addTerminalOutput,
    clearTerminal,
    sessions,
    setSessions,
    currentSession,
    setCurrentSession,
    currentModel,
    setCurrentModel,
    tokenUsage,
    setTokenUsage,
    activeTab,
    setActiveTab,
    logout,
    commands,
    setCommands,
  } = useAppStore();

  // Handle incoming WebSocket messages
  const handleMessage = useCallback(
    (event: WSServerEvent) => {
      switch (event.type) {
        case "auth:success":
          setAuthenticated(true);
          setAuthError(null);
          setIsConnecting(false);
          break;

        case "auth:error":
          setAuthError(event.message);
          setAuthenticated(false);
          setIsConnecting(false);
          break;

        case "project:list":
          setProjects(event.projects);
          break;

        case "project:current":
          setCurrentProject(event.project);
          break;

        case "file:tree":
          setFileTree(event.tree);
          break;

        case "file:content":
          setSelectedFile({ path: event.path, content: event.content });
          break;

        case "message:chunk": {
          const existingMsg = messages.find((m) => m.id === event.id);
          if (!existingMsg) {
            addMessage({
              id: event.id,
              role: "assistant",
              content: event.content,
              timestamp: new Date().toISOString(),
              isStreaming: true,
            });
          } else {
            updateMessage(event.id, event.content);
          }
          break;
        }

        case "message:tool_use": {
          const existingMsg = messages.find((m) => m.id === event.id);
          if (!existingMsg) {
            addMessage({
              id: event.id,
              role: "assistant",
              content: [{ type: "tool_use", id: event.id, name: event.toolName, input: {} }],
              timestamp: new Date().toISOString(),
              isStreaming: true,
            });
          } else {
            addToolUseToMessage(event.id, event.toolName, event.toolInput);
          }
          break;
        }

        case "message:done":
          setMessageDone(event.id);
          setLoading(false);
          setThinking(false);
          break;

        case "message:error":
          setLoading(false);
          setThinking(false);
          addMessage({
            id: event.id || uuidv7(),
            role: "assistant",
            content: `Error: ${event.error}`,
            timestamp: new Date().toISOString(),
          });
          break;

        case "message:thinking":
          setThinking(event.isThinking);
          break;

        case "terminal:output":
          addTerminalOutput(event.content);
          break;

        case "session:list":
          setSessions(event.sessions);
          break;

        case "session:current":
          setCurrentSession(event.session);
          break;

        case "session:info":
          setCurrentModel(event.model);
          setTokenUsage(event.usage);
          break;

        case "session:messages":
          setMessages(event.messages);
          break;

        case "session:id":
          // New session created - update currentSessionId for future messages
          console.log(`📋 New session ID: ${event.sessionId}`);
          break;

        case "commands:list":
          setCommands(event.commands);
          break;
      }
    },
    [
      setAuthenticated,
      setProjects,
      setCurrentProject,
      setFileTree,
      setSelectedFile,
      messages,
      setMessages,
      addMessage,
      updateMessage,
      addToolUseToMessage,
      setMessageDone,
      setLoading,
      setThinking,
      addTerminalOutput,
      setSessions,
      setCurrentSession,
      setCurrentModel,
      setTokenUsage,
      setCommands,
    ]
  );

  const { error: wsError, connect, disconnect, send } = useWebSocket({
    token: token || "",
    onMessage: handleMessage,
    onConnect: () => {
      setConnected(true);
      send({ type: "auth", token: token || "" });
    },
    onDisconnect: () => {
      setConnected(false);
    },
  });

  // Handle authentication
  const handleAuth = (newToken: string) => {
    setToken(newToken);
    setIsConnecting(true);
    setAuthError(null);
    connect(newToken);
  };

  // Handle logout
  const handleLogout = () => {
    disconnect();
    logout();
  };

  // Handle project selection
  const handleProjectSelect = (project: typeof currentProject) => {
    if (project) {
      setCurrentProject(project);
      send({ type: "project:switch", path: project.path });
      // Request session list and commands for new project
      setTimeout(() => {
        send({ type: "session:list" });
        send({ type: "commands:list" });
      }, 100);
    }
  };

  // Handle session selection
  const handleSessionSelect = (sessionId: string) => {
    send({ type: "session:switch", sessionId });
  };

  // Handle new session
  const handleNewSession = () => {
    setCurrentSession(null);
    setCurrentModel(null);
    setTokenUsage(null);
    // Clear messages for new session
    useAppStore.getState().clearMessages();
    // Tell backend to clear session ID
    send({ type: "session:new" });
  };

  // Handle file selection
  const handleFileSelect = (path: string) => {
    send({ type: "file:read", path });
    if (window.innerWidth < 1024) {
      setActiveTab("file");
    }
  };

  // Handle sending messages
  const handleSendMessage = (content: string) => {
    console.log("📤 handleSendMessage called:", content.slice(0, 50));

    if (!isConnected) {
      console.error("❌ Not connected to server");
      addMessage({
        id: uuidv7(),
        role: "assistant",
        content: "Error: Not connected to server. Please refresh the page.",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const userMessage: Message = {
      id: uuidv7(),
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    addMessage(userMessage);
    setLoading(true);

    const sent = send({ type: "message", content });
    if (!sent) {
      console.error("❌ Failed to send message");
      setLoading(false);
      addMessage({
        id: uuidv7(),
        role: "assistant",
        content: "Error: Failed to send message. Please check your connection.",
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Auto-connect if we have a stored token
  useEffect(() => {
    if (token && !isConnected && !isConnecting && !authenticated) {
      setIsConnecting(true);
      connect(token);
    }
  }, []);

  // Sync project and sessions after authentication
  useEffect(() => {
    if (authenticated && isConnected) {
      // Request commands (builtin + user level)
      send({ type: "commands:list" });

      if (currentProject) {
        // Re-sync project with server
        send({ type: "project:switch", path: currentProject.path });
        // Request session list and project commands
        setTimeout(() => {
          send({ type: "session:list" });
          send({ type: "commands:list" });
        }, 100);
      }
    }
  }, [authenticated, isConnected]);


  // Show auth screen if not authenticated
  if (!token || !authenticated) {
    return (
      <AuthScreen
        onAuth={handleAuth}
        error={authError || wsError}
        isConnecting={isConnecting}
      />
    );
  }

  // Helper to get model display name
  const getModelDisplayName = (model: string | null): string => {
    if (!model || model === "unknown") return "";
    if (model.includes("opus")) return "Opus 4.5";
    if (model.includes("sonnet")) return "Sonnet 4";
    if (model.includes("haiku")) return "Haiku";
    return model;
  };

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
      currentModel={getModelDisplayName(currentModel)}
      hasOpenFile={!!selectedFile}
      sidebar={
        <FileExplorer
          tree={fileTree}
          onFileSelect={handleFileSelect}
          selectedPath={selectedFile?.path}
        />
      }
    >
      {/* Desktop: VS Code-like layout */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* Center: File content + Terminal */}
        <div className="flex-1 flex flex-col border-r border-gray-700">
          {/* File content area */}
          <div className="flex-1 overflow-hidden">
            {selectedFile ? (
              <FileViewer
                path={selectedFile.path}
                content={selectedFile.content}
                onClose={() => setSelectedFile(null)}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>Select a file to view</p>
                </div>
              </div>
            )}
          </div>
          {/* Terminal at bottom */}
          <div className="h-48 border-t border-gray-700">
            <TerminalOutput output={terminalOutput} onClear={clearTerminal} />
          </div>
        </div>

        {/* Right: Session list + Chat */}
        <div className="w-[480px] flex flex-col">
          {/* Session panel at top */}
          <div className="border-b border-gray-700">
            <SessionPanel
              sessions={sessions}
              currentSession={currentSession}
              currentModel={currentModel}
              tokenUsage={tokenUsage}
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
              currentModel={currentModel}
              tokenUsage={tokenUsage}
              commands={commands}
            />
          </div>
        </div>
      </div>

      {/* Mobile: Tab-based navigation */}
      <div className="lg:hidden flex-1 overflow-hidden">
        {activeTab === "chat" && (
          <ChatPanel
            messages={messages}
            onSend={handleSendMessage}
            isLoading={isLoading}
            isThinking={isThinking}
            currentFile={selectedFile?.path}
            currentModel={currentModel}
            tokenUsage={tokenUsage}
            commands={commands}
            // Session selector in mobile chat
            showSessionSelector
            sessions={sessions}
            currentSession={currentSession}
            onSessionSelect={(session) => handleSessionSelect(session.id)}
            onNewSession={handleNewSession}
          />
        )}
        {activeTab === "file" && (
          selectedFile ? (
            <FileViewer
              path={selectedFile.path}
              content={selectedFile.content}
              onClose={() => setSelectedFile(null)}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center p-6">
                <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="mb-2">No file open</p>
                <p className="text-sm text-gray-600">Select a file from the Files tab</p>
              </div>
            </div>
          )
        )}
        {activeTab === "files" && (
          <div className="h-full overflow-y-auto">
            <FileExplorer
              tree={fileTree}
              onFileSelect={handleFileSelect}
              selectedPath={selectedFile?.path}
            />
          </div>
        )}
        {activeTab === "terminal" && (
          <TerminalOutput output={terminalOutput} onClear={clearTerminal} />
        )}
      </div>
    </Layout>
  );
}

export default App;
