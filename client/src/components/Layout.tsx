import { ReactNode, useState } from "react";
import type { Project, BrowseEntry } from "@shared/types";
import { ProjectSelector } from "./ProjectSelector";
import { useTheme } from "../hooks/useTheme";

type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";

interface LayoutProps {
  children: ReactNode;
  sidebar?: ReactNode;
  projects: Project[];
  currentProject: Project | null;
  onProjectSelect: (project: Project) => void;
  isConnected: boolean;
  connectionState?: ConnectionState;
  reconnectAttempts?: number;
  onReconnect?: () => void;
  activeTab: "chat" | "files" | "terminal" | "git";
  onTabChange: (tab: "chat" | "files" | "terminal" | "git") => void;
  gitChangeCount?: number;
  hasOpenFile?: boolean;
  onSettingsOpen?: () => void;
  // Folder browser
  browseEntries?: BrowseEntry[];
  browsePath?: string;
  onBrowseFolder?: (path: string) => void;
}

const TAB_CONFIG = [
  { id: "chat" as const, label: "Chat", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  { id: "files" as const, label: "Files", icon: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" },
  { id: "terminal" as const, label: "Terminal", icon: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { id: "git" as const, label: "Git", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
] as const;

export function Layout({
  children,
  sidebar,
  projects,
  currentProject,
  onProjectSelect,
  isConnected,
  connectionState,
  reconnectAttempts,
  onReconnect,
  activeTab,
  onTabChange,
  hasOpenFile,
  gitChangeCount,
  onSettingsOpen,
  browseEntries,
  browsePath,
  onBrowseFolder,
}: LayoutProps) {
  const isReconnecting = connectionState === "reconnecting";
  const isDisconnected = connectionState === "disconnected";
  const [projectDrawerOpen, setProjectDrawerOpen] = useState(false);
  const [showOpenFolder, setShowOpenFolder] = useState(false);
  const [folderPath, setFolderPath] = useState("");
  const { toggleTheme, isDark } = useTheme();

  return (
    <div className="h-screen-safe flex flex-col" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 safe-area-inset-top" style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)' }}>
        <div className="flex items-center gap-3">
          {/* Mobile: hamburger opens project list */}
          <button
            onClick={() => setProjectDrawerOpen(true)}
            className="lg:hidden p-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Logo — desktop only */}
          <div className="hidden lg:flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent)' }}>
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Claude Remote</h1>
          </div>

          {/* Mobile: show current project name */}
          <span className="lg:hidden text-sm font-medium truncate max-w-[180px]" style={{ color: 'var(--text-primary)' }}>
            {currentProject?.name || "Select Project"}
          </span>

          {/* Desktop: ProjectSelector dropdown */}
          <div className="hidden lg:block">
            <ProjectSelector
              projects={projects}
              currentProject={currentProject}
              onSelect={onProjectSelect}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Connection status */}
          <div className="flex items-center gap-2">
            {isReconnecting ? (
              <>
                <svg className="w-4 h-4 animate-spin" style={{ color: 'var(--warning)' }} fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm hidden sm:inline" style={{ color: 'var(--warning)' }}>
                  Reconnecting{reconnectAttempts ? ` (${reconnectAttempts})` : ""}...
                </span>
              </>
            ) : (
              <span className="w-2 h-2 rounded-full" style={{ background: isConnected ? 'var(--success)' : 'var(--error)' }} />
            )}
          </div>

          {/* Reconnect button */}
          {isDisconnected && onReconnect && (
            <button
              onClick={onReconnect}
              className="px-3 py-1 text-sm text-white rounded-lg transition-colors"
              style={{ background: 'var(--accent)' }}
            >
              Reconnect
            </button>
          )}

          <button
            onClick={toggleTheme}
            className="shrink-0 p-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          {/* Settings */}
          {onSettingsOpen && (
            <button
              onClick={onSettingsOpen}
              className="shrink-0 p-2 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Settings"
              aria-label="Open settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          )}

          {/* Logout moved to Settings screen */}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Desktop */}
        <aside className="hidden lg:block w-64 overflow-y-auto" style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-primary)' }}>
          {sidebar}
        </aside>

        {/* Main area — pb-16 on mobile to clear floating nav */}
        <main className="flex-1 flex flex-col overflow-hidden pb-16 lg:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile: Project drawer (bottom sheet) */}
      {projectDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end animate-fade-in"
          onClick={() => setProjectDrawerOpen(false)}>
          <div className="absolute inset-0" style={{ background: 'var(--bg-overlay)' }} />
          <div className="relative rounded-t-2xl pb-safe animate-slide-up max-h-[70vh] flex flex-col"
            style={{ background: 'var(--bg-secondary)' }}
            onClick={(e) => e.stopPropagation()}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-secondary)' }} />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid var(--border-primary)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Projects</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{projects.length} projects</span>
            </div>
            {/* Project list */}
            <div className="flex-1 overflow-y-auto">
              {projects.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  No projects found
                </div>
              ) : (
                projects.map((project) => (
                  <button key={project.id}
                    onClick={() => { onProjectSelect(project); setProjectDrawerOpen(false); }}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left transition-colors active:scale-[0.98]"
                    style={{
                      background: currentProject?.id === project.id ? 'var(--accent-light)' : 'transparent',
                    }}>
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      style={{ color: currentProject?.id === project.id ? 'var(--accent)' : 'var(--text-muted)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{
                        color: currentProject?.id === project.id ? 'var(--accent)' : 'var(--text-primary)'
                      }}>{project.name}</div>
                      <div className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{project.path}</div>
                    </div>
                    {currentProject?.id === project.id && (
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        style={{ color: 'var(--accent)' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))
              )}
            </div>
            {/* Open Folder / Browse */}
            <div style={{ borderTop: '1px solid var(--border-primary)' }}>
              {!showOpenFolder ? (
                <div className="px-4 pt-2">
                  <button
                    onClick={() => {
                      setShowOpenFolder(true);
                      onBrowseFolder?.(currentProject?.path || '/');
                    }}
                    className="w-full py-3 flex items-center justify-center gap-2 rounded-xl text-sm font-medium"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Open Folder
                  </button>
                </div>
              ) : (
                <>
                  {/* Current path + manual input */}
                  <div className="px-4 pt-2 pb-1">
                    <form className="flex gap-2" onSubmit={(e) => {
                      e.preventDefault();
                      const path = folderPath.trim();
                      if (path) onBrowseFolder?.(path);
                    }}>
                      <input
                        value={folderPath || browsePath || ''}
                        onChange={(e) => setFolderPath(e.target.value)}
                        placeholder="/path/to/folder"
                        className="flex-1 px-3 py-2 rounded-lg text-xs font-mono outline-none"
                        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}
                      />
                      <button type="submit"
                        className="px-3 py-2 rounded-lg text-xs font-medium"
                        style={{ background: 'var(--accent)', color: 'white' }}>
                        Go
                      </button>
                    </form>
                  </div>
                  {/* Folder list */}
                  <div className="max-h-[40vh] overflow-y-auto">
                    {browseEntries && browseEntries.length > 0 ? (
                      browseEntries.map((entry) => (
                        <button key={entry.path}
                          onClick={() => {
                            setFolderPath('');
                            onBrowseFolder?.(entry.path);
                          }}
                          className="w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors active:scale-[0.98]">
                          {entry.name === '..' ? (
                            <svg className="w-5 h-5 shrink-0" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              style={{ color: entry.isGitRepo ? 'var(--accent)' : 'var(--text-muted)' }}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                              {entry.name}
                            </div>
                          </div>
                          {entry.isGitRepo && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                              git
                            </span>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                        {browseEntries ? 'Empty folder' : 'Loading...'}
                      </div>
                    )}
                  </div>
                  {/* Select this folder */}
                  {browsePath && (
                    <div className="px-4 py-2">
                      <button
                        onClick={() => {
                          onProjectSelect({ id: btoa(browsePath), name: browsePath.split('/').pop() || browsePath, path: browsePath });
                          setProjectDrawerOpen(false);
                          setShowOpenFolder(false);
                          setFolderPath('');
                        }}
                        className="w-full py-3 rounded-xl text-sm font-medium"
                        style={{ background: 'var(--accent)', color: 'white' }}>
                        Open "{browsePath.split('/').pop()}"
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            {/* Cancel */}
            <div className="px-4 pb-4 pt-1">
              <button onClick={() => { setProjectDrawerOpen(false); setShowOpenFolder(false); setFolderPath(''); }}
                className="w-full py-3 rounded-xl text-sm font-medium"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile floating bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 safe-area-inset-bottom">
        <div className="mx-3 mb-2 rounded-2xl glass" style={{ border: '1px solid var(--glass-border)' }}>
          <div className="flex">
            {TAB_CONFIG.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="flex-1 py-2.5 flex flex-col items-center gap-1 transition-all active:scale-95"
                style={{
                  color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                <div className="relative">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                  </svg>
                  {tab.id === "files" && hasOpenFile && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
                  )}
                  {tab.id === "git" && gitChangeCount != null && gitChangeCount > 0 && (
                    <span className="absolute -top-1 -right-2 px-1 text-[9px] rounded-full text-white leading-tight" style={{ background: 'var(--accent)' }}>
                      {gitChangeCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{tab.label}</span>
                {activeTab === tab.id && (
                  <div className="absolute bottom-1 w-4 h-0.5 rounded-full" style={{ background: 'var(--accent)' }} />
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}
