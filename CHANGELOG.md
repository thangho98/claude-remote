# Changelog

All notable changes to claude-remote will be documented in this file.

## [Unreleased]

### Added
- **Slash Commands Autocomplete** - Type `/` to see available commands with keyboard navigation (Arrow keys, Tab/Enter to select, Escape to close)
- **Provider Pattern Architecture** - Abstraction layer supporting both Claude CLI and Claude Agent SDK backends
- **Commands Discovery Service** - Auto-discovers builtin, project, and user slash commands
- **Thinking Content Streaming** - Capture and display Claude's thinking blocks in real-time
- **Tool Use Display** - Render tool calls and tool results in message stream
- **Mobile-friendly Input** - Touch event handlers and responsive keyboard behavior
- **Auto Session Info Refresh** - Model and token usage update automatically after each message
- **Reconnecting UI** - Show "Reconnecting..." when client has stored token and is reconnecting

### Changed
- **SDK V2 API** - Updated to use `unstable_v2_createSession` (no API key needed, uses OAuth)
- **Tailwind CSS v4** - Migrated to CSS-first configuration
- Migrated WebSocket message handler to use provider pattern
- Commands automatically fetched on authentication and project switch
- **Session list auto-loads** after project switch (server sends session:list automatically)

### Fixed
- **Duplicate Key Warning** - Fixed React duplicate key error in MessageList by adding ID check in `addMessage`
- **iOS Safari UUID** - Added fallback for `crypto.randomUUID` not available on older iOS
- **iOS Touch Events** - Send button now responds to touch via `onTouchEnd`
- **Mobile Multiline Input** - Disabled Enter-to-submit on mobile to allow multiline
- **Session Reload** - Sessions now reload properly after authentication
- **ENOENT Errors** - Silent handling for missing session files (expected behavior)
- **Path Transformation** - Fixed underscore handling in project paths for Claude folder naming
- **Orphaned Sessions** - Hybrid discovery scans filesystem + index to find all sessions
- **Message Content Types** - Proper handling for both string and ContentBlock[] in streaming updates
- **React StrictMode WebSocket** - Fixed double mount/unmount causing WebSocket disconnect before connection established
- **Stale Closure in handleMessage** - Use `useAppStore.getState().messages` instead of closure-captured variable
- **Tool Use Input Parsing** - Parse toolInput from JSON string when creating/appending tool_use blocks

## [0.1.0] - 2026-02-01

### Added
- Initial project structure with Bun monorepo (server, client, shared)
- WebSocket-based real-time communication
- Claude CLI integration via subprocess
- Session management (list, switch, resume)
- Project switching with file explorer
- Message streaming with chunk-based delivery
- Basic authentication flow
- Tailwind CSS styling
- Zustand state management
