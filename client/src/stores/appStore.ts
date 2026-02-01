import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Message, Project, FileNode, Session, TokenUsage } from "@shared/types";

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
  activeTab: "chat" | "file" | "files" | "terminal";
  sidebarOpen: boolean;
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

  // Sessions
  setSessions: (sessions: Session[]) => void;
  setCurrentSession: (session: Session | null) => void;
  setCurrentModel: (model: string | null) => void;
  setTokenUsage: (usage: TokenUsage | null) => void;

  // UI
  setActiveTab: (tab: "chat" | "file" | "files" | "terminal") => void;
  toggleSidebar: () => void;
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
      fileTree: null,
      selectedFile: null,
      terminalOutput: [],
      sessions: [],
      currentSession: null,
      currentModel: null,
      tokenUsage: null,
      activeTab: "chat",
      sidebarOpen: true,

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
        set((state) => ({ messages: [...state.messages, message] })),

      updateMessage: (id, content) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, content: m.content + content } : m
          ),
        })),

      setMessageDone: (id) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, isStreaming: false } : m
          ),
        })),

      clearMessages: () => set({ messages: [] }),

      // Files
      setFileTree: (fileTree) => set({ fileTree }),
      setSelectedFile: (selectedFile) => set({ selectedFile }),

      // Terminal
      addTerminalOutput: (output) =>
        set((state) => ({
          terminalOutput: [...state.terminalOutput, output].slice(-500), // Keep last 500 lines
        })),

      clearTerminal: () => set({ terminalOutput: [] }),

      // Loading
      setLoading: (isLoading) => set({ isLoading }),

      // Sessions
      setSessions: (sessions) => set({ sessions }),
      setCurrentSession: (currentSession) => set({ currentSession }),
      setCurrentModel: (currentModel) => set({ currentModel }),
      setTokenUsage: (tokenUsage) => set({ tokenUsage }),

      // UI
      setActiveTab: (activeTab) => set({ activeTab }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    }),
    {
      name: "claude-remote-storage",
      partialize: (state) => ({
        token: state.token,
        currentProject: state.currentProject,
      }),
    }
  )
);
