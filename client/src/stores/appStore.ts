import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { persist } from 'zustand/middleware';
import type { Message, Project, FileNode, Session, TokenUsage, SlashCommand, GitStatusInfo, GitChange, GitDiffResult, TerminalSession } from '@shared/types';

interface AppState {
  // Auth
  token: string | null;
  authenticated: boolean;

  // Connection
  isConnected: boolean;

  // Projects
  currentProject: Project | null;
  projects: Project[];

  // Chat
  messages: Message[];
  isLoading: boolean;
  isThinking: boolean;

  // Files
  fileTree: FileNode | null;
  selectedFile: { path: string; content: string } | null;

  // Terminal
  terminalOutput: string[];
  terminalSessions: TerminalSession[];
  activeTerminalId: string | null;

  // Sessions
  sessions: Session[];
  currentSession: Session | null;
  currentModel: string | null;
  tokenUsage: TokenUsage | null;

  // Git
  gitStatus: GitStatusInfo | null;
  gitChanges: GitChange[];
  selectedDiff: GitDiffResult | null;
  bottomPanelTab: 'terminal' | 'git';

  // UI
  activeTab: 'chat' | 'file' | 'files' | 'terminal' | 'git';

  // Commands
  commands: SlashCommand[];
}

interface AppActions {
  // Auth
  setToken: (token: string | null) => void;
  setAuthenticated: (authenticated: boolean) => void;
  logout: () => void;

  // Connection
  setConnected: (connected: boolean) => void;

  // Projects
  setProjects: (projects: Project[]) => void;
  setCurrentProject: (project: Project | null) => void;

  // Messages
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  upsertMessage: (message: Message) => void;
  addToolUseToMessage: (id: string, toolName: string, toolInput: string) => void;
  addThinkingToMessage: (id: string, content: string) => void;
  setMessageDone: (id: string) => void;
  clearMessages: () => void;

  // Files
  setFileTree: (tree: FileNode | null) => void;
  setSelectedFile: (file: { path: string; content: string } | null) => void;

  // Terminal
  addTerminalOutput: (output: string) => void;
  clearTerminal: () => void;
  addTerminalSession: (session: TerminalSession) => void;
  removeTerminalSession: (id: string) => void;
  setActiveTerminalId: (id: string | null) => void;
  clearTerminalSessions: () => void;

  // Loading
  setLoading: (loading: boolean) => void;
  setThinking: (thinking: boolean) => void;

  // Sessions
  setSessions: (sessions: Session[]) => void;
  setCurrentSession: (session: Session | null) => void;
  setCurrentModel: (model: string | null) => void;
  setTokenUsage: (usage: TokenUsage | null) => void;

  // Git
  setGitStatus: (status: GitStatusInfo | null) => void;
  setGitChanges: (changes: GitChange[]) => void;
  setSelectedDiff: (diff: GitDiffResult | null) => void;
  setBottomPanelTab: (tab: 'terminal' | 'git') => void;

  // UI
  setActiveTab: (tab: 'chat' | 'file' | 'files' | 'terminal' | 'git') => void;

  // Commands
  setCommands: (commands: SlashCommand[]) => void;
}

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set) => ({
      // Initial state
      token: null,
      authenticated: false,
      isConnected: false,
      currentProject: null,
      projects: [],
      messages: [],
      isLoading: false,
      isThinking: false,
      fileTree: null,
      selectedFile: null,
      terminalOutput: [],
      terminalSessions: [],
      activeTerminalId: null,
      sessions: [],
      currentSession: null,
      currentModel: null,
      tokenUsage: null,
      gitStatus: null,
      gitChanges: [],
      selectedDiff: null,
      bottomPanelTab: 'terminal',
      activeTab: 'chat',
      commands: [],

      // Auth
      setToken: (token) => set({ token }),
      setAuthenticated: (authenticated) => set({ authenticated }),
      logout: () =>
        set({
          token: null,
          authenticated: false,
          isConnected: false,
          messages: [],
          currentProject: null,
        }),

      // Connection
      setConnected: (isConnected) => set({ isConnected }),

      // Projects
      setProjects: (projects) => set({ projects }),
      setCurrentProject: (currentProject) =>
        set({
          currentProject,
          messages: [],
          sessions: [],
          currentSession: null,
          currentModel: null,
          tokenUsage: null,
          gitStatus: null,
          gitChanges: [],
          selectedDiff: null,
          terminalSessions: [],
          activeTerminalId: null,
        }),

      // Messages
      setMessages: (messages) => set({ messages }),
      addMessage: (message) =>
        set((state) => {
          if (state.messages.some((m) => m.id === message.id)) {
            return state;
          }
          return { messages: [...state.messages, message] };
        }),

      updateMessage: (id, content) =>
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id !== id) return m;
            if (typeof m.content === 'string') {
              return { ...m, content: m.content + content };
            }
            const blocks = [...m.content];
            const lastBlock = blocks[blocks.length - 1];
            if (lastBlock && lastBlock.type === 'text') {
              blocks[blocks.length - 1] = { ...lastBlock, text: lastBlock.text + content };
            } else {
              blocks.push({ type: 'text' as const, text: content });
            }
            return { ...m, content: blocks };
          }),
        })),

      upsertMessage: (message) =>
        set((state) => {
          const index = state.messages.findIndex((m) => m.id === message.id);
          if (index !== -1) {
            const newMessages = [...state.messages];
            newMessages[index] = message;
            return { messages: newMessages };
          }
          return { messages: [...state.messages, message] };
        }),

      addToolUseToMessage: (id, toolName, toolInput) =>
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id !== id) return m;
            const currentContent =
              typeof m.content === 'string' ? [{ type: 'text' as const, text: m.content }] : m.content;
            let parsedInput: Record<string, unknown> = {};
            if (typeof toolInput === 'string') {
              try {
                parsedInput = JSON.parse(toolInput);
              } catch {
                parsedInput = { raw: toolInput };
              }
            } else if (toolInput && typeof toolInput === 'object') {
              parsedInput = toolInput as Record<string, unknown>;
            }
            return {
              ...m,
              content: [
                ...currentContent,
                { type: 'tool_use' as const, id: `${id}-${toolName}`, name: toolName, input: parsedInput },
              ],
            };
          }),
        })),

      addThinkingToMessage: (id, content) =>
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id !== id) return m;
            const currentContent =
              typeof m.content === 'string' ? [{ type: 'text' as const, text: m.content }] : [...m.content];
            const lastBlock = currentContent[currentContent.length - 1];
            if (lastBlock && lastBlock.type === 'thinking') {
              currentContent[currentContent.length - 1] = {
                ...lastBlock,
                thinking: (lastBlock as { type: 'thinking'; thinking: string }).thinking + content,
              };
              return { ...m, content: currentContent };
            } else {
              return {
                ...m,
                content: [...currentContent, { type: 'thinking' as const, thinking: content }],
              };
            }
          }),
        })),

      setMessageDone: (id) =>
        set((state) => ({
          messages: state.messages.map((m) => (m.id === id ? { ...m, isStreaming: false } : m)),
        })),

      clearMessages: () => set({ messages: [] }),

      // Files
      setFileTree: (fileTree) => set({ fileTree }),
      setSelectedFile: (selectedFile) => set({ selectedFile }),

      // Terminal
      addTerminalOutput: (output) =>
        set((state) => ({
          terminalOutput: [...state.terminalOutput, output].slice(-500),
        })),

      clearTerminal: () => set({ terminalOutput: [] }),

      addTerminalSession: (session) =>
        set((state) => ({
          terminalSessions: [...state.terminalSessions, session],
          activeTerminalId: session.id,
        })),

      removeTerminalSession: (id) =>
        set((state) => {
          const remaining = state.terminalSessions.filter((s) => s.id !== id);
          return {
            terminalSessions: remaining,
            activeTerminalId:
              state.activeTerminalId === id
                ? remaining[remaining.length - 1]?.id ?? null
                : state.activeTerminalId,
          };
        }),

      setActiveTerminalId: (activeTerminalId) => set({ activeTerminalId }),

      clearTerminalSessions: () => set({ terminalSessions: [], activeTerminalId: null }),

      // Loading
      setLoading: (isLoading) => set({ isLoading }),
      setThinking: (isThinking) => set({ isThinking }),

      // Sessions
      setSessions: (sessions) => set({ sessions }),
      setCurrentSession: (currentSession) => set({ currentSession }),
      setCurrentModel: (currentModel) => set({ currentModel }),
      setTokenUsage: (tokenUsage) => set({ tokenUsage }),

      // Git
      setGitStatus: (gitStatus) => set({ gitStatus }),
      setGitChanges: (gitChanges) => set({ gitChanges }),
      setSelectedDiff: (selectedDiff) => set({ selectedDiff }),
      setBottomPanelTab: (bottomPanelTab) => set({ bottomPanelTab }),

      // UI
      setActiveTab: (activeTab) => set({ activeTab }),

      // Commands
      setCommands: (commands) => set({ commands }),
    }),
    {
      name: 'claude-remote-storage',
      partialize: (state) => ({
        token: state.token,
        currentProject: state.currentProject,
      }),
    },
  ),
);

// --- Stable selector hooks (prevent unnecessary re-renders) ---
// Use these instead of destructuring the full store in components

export const useAuthStore = () =>
  useAppStore(useShallow((s) => ({ token: s.token, setToken: s.setToken, authenticated: s.authenticated, logout: s.logout })));

export const useConnectionStore = () =>
  useAppStore(useShallow((s) => ({ isConnected: s.isConnected, setConnected: s.setConnected })));

export const useProjectStore = () =>
  useAppStore(useShallow((s) => ({ projects: s.projects, currentProject: s.currentProject, setCurrentProject: s.setCurrentProject })));

export const useFileStore = () =>
  useAppStore(useShallow((s) => ({ fileTree: s.fileTree, selectedFile: s.selectedFile, setSelectedFile: s.setSelectedFile })));

export const useMessageStore = () =>
  useAppStore(useShallow((s) => ({ messages: s.messages, addMessage: s.addMessage, clearMessages: s.clearMessages })));

export const useLoadingStore = () =>
  useAppStore(useShallow((s) => ({ isLoading: s.isLoading, setLoading: s.setLoading, isThinking: s.isThinking })));

export const useTerminalStore = () =>
  useAppStore(useShallow((s) => ({ terminalOutput: s.terminalOutput, clearTerminal: s.clearTerminal })));

export const useTerminalSessionStore = () =>
  useAppStore(useShallow((s) => ({
    terminalSessions: s.terminalSessions,
    activeTerminalId: s.activeTerminalId,
    addTerminalSession: s.addTerminalSession,
    removeTerminalSession: s.removeTerminalSession,
    setActiveTerminalId: s.setActiveTerminalId,
  })));

export const useSessionStore = () =>
  useAppStore(useShallow((s) => ({
    sessions: s.sessions,
    currentSession: s.currentSession,
    setCurrentSession: s.setCurrentSession,
    currentModel: s.currentModel,
    setCurrentModel: s.setCurrentModel,
    tokenUsage: s.tokenUsage,
    setTokenUsage: s.setTokenUsage,
  })));

export const useGitStore = () =>
  useAppStore(useShallow((s) => ({
    gitStatus: s.gitStatus,
    gitChanges: s.gitChanges,
    selectedDiff: s.selectedDiff,
    setSelectedDiff: s.setSelectedDiff,
  })));

export const useBottomPanelStore = () =>
  useAppStore(useShallow((s) => ({
    bottomPanelTab: s.bottomPanelTab,
    setBottomPanelTab: s.setBottomPanelTab,
  })));

export const useUIStore = () =>
  useAppStore(useShallow((s) => ({ activeTab: s.activeTab, setActiveTab: s.setActiveTab, commands: s.commands })));
