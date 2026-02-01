# Changelog

All notable changes to claude-remote will be documented in this file.

## [Unreleased]

### Added
- **Slash Commands Autocomplete** - Type `/` to see available commands with keyboard navigation (Arrow keys, Tab/Enter to select, Escape to close)
- **Provider Pattern Architecture** - Abstraction layer supporting both Claude CLI and Claude Agent SDK backends
- **Commands Discovery Service** - Auto-discovers builtin, project, and user slash commands
- **Thinking Indicator** - Visual feedback when Claude is in extended thinking mode
- **Mobile-friendly Input** - Touch event handlers and responsive keyboard behavior

### Changed
- Migrated WebSocket message handler to use provider pattern
- Commands automatically fetched on authentication and project switch

### Fixed
- **iOS Safari UUID** - Added fallback for `crypto.randomUUID` not available on older iOS
- **iOS Touch Events** - Send button now responds to touch via `onTouchEnd`
- **Mobile Multiline Input** - Disabled Enter-to-submit on mobile to allow multiline
- **Session Reload** - Sessions now reload properly after authentication

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
