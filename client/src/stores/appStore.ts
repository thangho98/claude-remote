import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { persist } from 'zustand/middleware';
import type {
  Message,
  Project,
  FileNode,
  Session,
  TokenUsage,
  SlashCommand,
  GitStatusInfo,
  GitChange,
  GitDiffResult,
  TerminalSession,
  SettingsProfile,
  ChatProvider,
  ProviderInterface,
  ProviderSettingsSummary,
} from '@shared/types';

interface AppState {
  // Auth
  token: string | null;
  authenticated: boolean;

  // Connection
  isConnected: boolean;

  // Projects
  currentProject: Project | null;
  projects: Project[];

  // Chat - keyed by sessionId
  messagesBySession: Record<string, Message[]>;
  currentMessages: Message[]; // Computed from currentSession
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

  // Settings
  settings: {
    provider: ChatProvider;
    interface: ProviderInterface;
    providers: ProviderSettingsSummary[];
    permissionMode: string;
    model: string;
    models: { value: string; displayName: string; description: string }[];
    mcpServers: { name: string; type: string; status: string }[];
    claudeConfig: Record<string, unknown>;
    tokenUsage: TokenUsage | null;
    costInfo: { totalCostUsd: number; usage: Record<string, unknown>; modelUsage: Record<string, unknown> } | null;
    rateLimits: Record<string, { resetsAt?: number; status: string }>;
    accountInfo: { email?: string; subscriptionType?: string; apiProvider?: string } | null;
    usageQuota: {
      five_hour: { utilization: number; resets_at: string } | null;
      seven_day: { utilization: number; resets_at: string } | null;
      seven_day_sonnet: { utilization: number; resets_at: string } | null;
      seven_day_opus: { utilization: number; resets_at: string } | null;
    } | null;
    maxMessagesPerSession: number;
    maxSessionsPerProject: number;
  } | null;

  // Models
  models: { value: string; displayName: string; description: string }[];

  // UI
  activeTab: 'chat' | 'files' | 'terminal' | 'git';
  theme: 'light' | 'dark';

  // Commands
  commands: SlashCommand[];

  // Profiles
  profiles: SettingsProfile[];
  currentProfile: SettingsProfile | null;
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

  // Messages - now session-scoped
  setMessagesForSession: (sessionId: string, messages: Message[]) => void;
  addMessageToSession: (sessionId: string, message: Message) => void;
  updateMessageInSession: (sessionId: string, messageId: string, content: string) => void;
  upsertMessageInSession: (sessionId: string, message: Message) => void;
  addToolUseToMessageInSession: (sessionId: string, messageId: string, toolName: string, toolInput: string) => void;
  addThinkingToMessageInSession: (sessionId: string, messageId: string, content: string) => void;
  setMessageDoneInSession: (sessionId: string, messageId: string) => void;
  clearMessagesForSession: (sessionId: string) => void;
  clearAllMessages: () => void;

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

  // Settings
  setSettings: (settings: AppState['settings']) => void;
  setModels: (models: AppState['models']) => void;

  // UI
  setActiveTab: (tab: 'chat' | 'files' | 'terminal' | 'git') => void;
  setTheme: (theme: 'light' | 'dark') => void;

  // Commands
  setCommands: (commands: SlashCommand[]) => void;

  // Profiles
  setProfiles: (profiles: SettingsProfile[]) => void;
  setCurrentProfile: (profile: SettingsProfile | null) => void;
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
      messagesBySession: {},
      currentMessages: [],
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
      settings: null,
      models: [],
      activeTab: 'chat',
      theme: 'dark',
      commands: [],
      profiles: [],
      currentProfile: null,

      // Auth
      setToken: (token) => set({ token }),
      setAuthenticated: (authenticated) => set({ authenticated }),
      logout: () =>
        set({
          token: null,
          authenticated: false,
          isConnected: false,
          messagesBySession: {},
          currentMessages: [],
          currentProject: null,
        }),

      // Connection
      setConnected: (isConnected) => set({ isConnected }),

      // Projects
      setProjects: (projects) => set({ projects }),
      setCurrentProject: (currentProject) =>
        set({
          currentProject,
          messagesBySession: {},
          currentMessages: [],
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

      // Messages - session scoped
      setMessagesForSession: (sessionId, messages) =>
        set((state) => {
          // Trim to max messages limit from settings (default 50)
          const maxMessages = state.settings?.maxMessagesPerSession ?? 50;
          const trimmedMessages = messages.length > maxMessages ? messages.slice(-maxMessages) : messages;
          return {
            messagesBySession: { ...state.messagesBySession, [sessionId]: trimmedMessages },
            currentMessages: state.currentSession?.id === sessionId ? trimmedMessages : state.currentMessages,
          };
        }),

      addMessageToSession: (sessionId, message) =>
        set((state) => {
          const sessionMessages = state.messagesBySession[sessionId] || [];
          if (sessionMessages.some((m) => m.id === message.id)) {
            return state;
          }
          // Trim to max messages limit from settings (default 50)
          const maxMessages = state.settings?.maxMessagesPerSession ?? 50;
          let newMessages = [...sessionMessages, message];
          if (newMessages.length > maxMessages) {
            newMessages = newMessages.slice(-maxMessages);
          }
          return {
            messagesBySession: { ...state.messagesBySession, [sessionId]: newMessages },
            currentMessages: state.currentSession?.id === sessionId ? newMessages : state.currentMessages,
          };
        }),

      updateMessageInSession: (sessionId, messageId, content) =>
        set((state) => {
          const sessionMessages = state.messagesBySession[sessionId] || [];
          const newMessages = sessionMessages.map((m) => {
            if (m.id !== messageId) return m;
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
          });
          return {
            messagesBySession: { ...state.messagesBySession, [sessionId]: newMessages },
            currentMessages: state.currentSession?.id === sessionId ? newMessages : state.currentMessages,
          };
        }),

      upsertMessageInSession: (sessionId, message) =>
        set((state) => {
          const sessionMessages = state.messagesBySession[sessionId] || [];
          const index = sessionMessages.findIndex((m) => m.id === message.id);
          let newMessages: Message[];
          if (index !== -1) {
            newMessages = [...sessionMessages];
            newMessages[index] = message;
          } else {
            newMessages = [...sessionMessages, message];
          }
          // Trim to max messages limit from settings (default 50)
          const maxMessages = state.settings?.maxMessagesPerSession ?? 50;
          if (newMessages.length > maxMessages) {
            newMessages = newMessages.slice(-maxMessages);
          }
          return {
            messagesBySession: { ...state.messagesBySession, [sessionId]: newMessages },
            currentMessages: state.currentSession?.id === sessionId ? newMessages : state.currentMessages,
          };
        }),

      addToolUseToMessageInSession: (sessionId, messageId, toolName, toolInput) =>
        set((state) => {
          const sessionMessages = state.messagesBySession[sessionId] || [];
          const newMessages = sessionMessages.map((m) => {
            if (m.id !== messageId) return m;
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
                { type: 'tool_use' as const, id: `${messageId}-${toolName}`, name: toolName, input: parsedInput },
              ],
            };
          });
          return {
            messagesBySession: { ...state.messagesBySession, [sessionId]: newMessages },
            currentMessages: state.currentSession?.id === sessionId ? newMessages : state.currentMessages,
          };
        }),

      addThinkingToMessageInSession: (sessionId, messageId, content) =>
        set((state) => {
          const sessionMessages = state.messagesBySession[sessionId] || [];
          const newMessages = sessionMessages.map((m) => {
            if (m.id !== messageId) return m;
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
          });
          return {
            messagesBySession: { ...state.messagesBySession, [sessionId]: newMessages },
            currentMessages: state.currentSession?.id === sessionId ? newMessages : state.currentMessages,
          };
        }),

      setMessageDoneInSession: (sessionId, messageId) =>
        set((state) => {
          const sessionMessages = state.messagesBySession[sessionId] || [];
          const newMessages = sessionMessages.map((m) => (m.id === messageId ? { ...m, isStreaming: false } : m));
          return {
            messagesBySession: { ...state.messagesBySession, [sessionId]: newMessages },
            currentMessages: state.currentSession?.id === sessionId ? newMessages : state.currentMessages,
          };
        }),

      clearMessagesForSession: (sessionId) =>
        set((state) => {
          const { [sessionId]: _, ...rest } = state.messagesBySession;
          return {
            messagesBySession: rest,
            currentMessages: state.currentSession?.id === sessionId ? [] : state.currentMessages,
          };
        }),

      clearAllMessages: () => set({ messagesBySession: {}, currentMessages: [] }),

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
      setCurrentSession: (currentSession) =>
        set((state) => ({
          currentSession,
          currentMessages: currentSession ? state.messagesBySession[currentSession.id] || [] : [],
        })),
      setCurrentModel: (currentModel) => set({ currentModel }),
      setTokenUsage: (tokenUsage) => set({ tokenUsage }),

      // Git
      setGitStatus: (gitStatus) => set({ gitStatus }),
      setGitChanges: (gitChanges) => set({ gitChanges }),
      setSelectedDiff: (selectedDiff) => set({ selectedDiff }),
      setBottomPanelTab: (bottomPanelTab) => set({ bottomPanelTab }),

      // Settings
      setSettings: (settings) => set({ settings }),
      setModels: (models) => set({ models }),

      // UI
      setActiveTab: (activeTab) => set({ activeTab }),
      setTheme: (theme) => set({ theme }),

      // Commands
      setCommands: (commands) => set({ commands }),
      setProfiles: (profiles) => set({ profiles }),
      setCurrentProfile: (currentProfile) => set({ currentProfile }),
    }),
    {
      name: 'claude-remote-storage',
      partialize: (state) => ({
        token: state.token,
        currentProject: state.currentProject,
        theme: state.theme,
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
  useAppStore(useShallow((s) => ({
    messages: s.currentMessages,
    messagesBySession: s.messagesBySession,
    addMessageToSession: s.addMessageToSession,
    clearAllMessages: s.clearAllMessages,
    clearMessagesForSession: s.clearMessagesForSession,
    setMessagesForSession: s.setMessagesForSession,
  })));

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

export const useSettingsStore = () =>
  useAppStore(useShallow((s) => ({ settings: s.settings, setSettings: s.setSettings })));

export const useUIStore = () =>
  useAppStore(useShallow((s) => ({ activeTab: s.activeTab, setActiveTab: s.setActiveTab, commands: s.commands, models: s.models, theme: s.theme, setTheme: s.setTheme, profiles: s.profiles, currentProfile: s.currentProfile, setCurrentProfile: s.setCurrentProfile })));
