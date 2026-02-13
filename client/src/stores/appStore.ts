import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { persist } from 'zustand/middleware';
import type { Message, Project, FileNode, Session, TokenUsage, SlashCommand } from '@shared/types';

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

  // Sessions
  sessions: Session[];
  currentSession: Session | null;
  currentModel: string | null;
  tokenUsage: TokenUsage | null;

  // UI
  activeTab: 'chat' | 'file' | 'files' | 'terminal';

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

  // Loading
  setLoading: (loading: boolean) => void;
  setThinking: (thinking: boolean) => void;

  // Sessions
  setSessions: (sessions: Session[]) => void;
  setCurrentSession: (session: Session | null) => void;
  setCurrentModel: (model: string | null) => void;
  setTokenUsage: (usage: TokenUsage | null) => void;

  // UI
  setActiveTab: (tab: 'chat' | 'file' | 'files' | 'terminal') => void;

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
      sessions: [],
      currentSession: null,
      currentModel: null,
      tokenUsage: null,
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

      // Loading
      setLoading: (isLoading) => set({ isLoading }),
      setThinking: (isThinking) => set({ isThinking }),

      // Sessions
      setSessions: (sessions) => set({ sessions }),
      setCurrentSession: (currentSession) => set({ currentSession }),
      setCurrentModel: (currentModel) => set({ currentModel }),
      setTokenUsage: (tokenUsage) => set({ tokenUsage }),

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

export const useUIStore = () =>
  useAppStore(useShallow((s) => ({ activeTab: s.activeTab, setActiveTab: s.setActiveTab, commands: s.commands })));
