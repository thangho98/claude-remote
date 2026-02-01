# Claude Remote - Design Specification

> **Web interface cho Claude Code CLI** - Truy cập từ mobile/browser, tiếp tục làm việc như trên terminal

**Created:** 2026-02-01
**Status:** Draft

---

## 1. Product Vision

### Problem
- Claude Code CLI chỉ chạy trên terminal
- Không thể tiếp tục làm việc khi rời máy tính
- Muốn check progress hoặc gửi command từ điện thoại

### Solution
Web application cho phép:
- Truy cập Claude Code từ bất kỳ browser nào
- Tiếp tục session đang chạy từ mobile
- Làm việc với mọi project đã làm việc với Claude CLI

### Target User
- Single user (chủ sở hữu)
- Developer sử dụng Claude Code CLI hàng ngày

---

## 2. Requirements Summary

| Category | Decision |
|----------|----------|
| **Authentication** | Single-user, token-based |
| **Sessions** | Persistent (resume anytime) |
| **Projects** | Multi-project selector |
| **Deployment** | Local machine |
| **Mobile** | Responsive web |
| **Integration** | Claude Agent SDK |

---

## 3. Tech Stack

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend                            │
│            React + Vite + TypeScript + Tailwind          │
│                   (Mobile Responsive)                    │
├─────────────────────────────────────────────────────────┤
│                      WebSocket                           │
│              Real-time streaming & sync                  │
├─────────────────────────────────────────────────────────┤
│                       Backend                            │
│                    Bun + Hono                            │
├─────────────────────────────────────────────────────────┤
│                    Claude Agent SDK                      │
│              (@anthropic-ai/claude-agent-sdk)            │
└─────────────────────────────────────────────────────────┘
```

### Why These Choices

| Tech | Reason |
|------|--------|
| **Bun** | Anthropic owns Bun, optimized for Claude SDK, 13x faster than Node |
| **Hono** | Lightweight, Bun-native, excellent TypeScript support |
| **React + Vite** | Fast dev experience, simple SPA (không cần SSR) |
| **Tailwind** | Rapid responsive UI development |
| **Native WebSocket** | Bun's uWebSockets - best performance |

---

## 4. Architecture

### 4.1 High-Level Architecture

```
┌──────────────┐     WebSocket      ┌──────────────┐
│   Browser    │◄──────────────────►│    Server    │
│  (React UI)  │                    │  (Bun+Hono)  │
└──────────────┘                    └──────┬───────┘
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │ Claude Agent │
                                   │     SDK      │
                                   └──────┬───────┘
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │  File System │
                                   │  (Projects)  │
                                   └──────────────┘
```

### 4.2 Core Components

#### Backend Components

| Component | Responsibility |
|-----------|----------------|
| **WebSocket Server** | Real-time communication với clients |
| **Session Manager** | Quản lý persistent Claude sessions |
| **Project Manager** | List/switch projects, file operations |
| **Auth Middleware** | Token validation |
| **Claude SDK Bridge** | Interface với Claude Agent SDK |

#### Frontend Components

| Component | Responsibility |
|-----------|----------------|
| **ChatPanel** | Messages, input, streaming response |
| **FileExplorer** | Directory tree, file viewer |
| **TerminalOutput** | Command execution logs |
| **ProjectSelector** | Switch between projects |
| **Layout** | Responsive layout management |

### 4.3 Data Flow

```
User Input → WebSocket → Server → Claude SDK → Response
                                      ↓
                              Stream chunks
                                      ↓
                    WebSocket ← Server ← SDK Events
                         ↓
                   UI Update (real-time)
```

---

## 5. Features Specification

### 5.1 v1 (MVP)

#### F1: Chat Interface
- **Input:** Text input với submit button
- **Output:** Streaming response từ Claude
- **Features:**
  - Markdown rendering
  - Code syntax highlighting
  - Auto-scroll
  - Loading indicator
  - Error display

#### F2: File Explorer
- **Tree View:** Directory structure của project
- **File Viewer:** Read-only file content với syntax highlight
- **Actions:**
  - Navigate directories
  - View file content
  - Show file path (for context)

#### F3: Terminal Output
- **Purpose:** Hiển thị commands Claude đang chạy
- **Features:**
  - Real-time output streaming
  - ANSI color support
  - Scrollable history
  - Clear button

#### F4: Project Selector
- **List:** Tất cả projects đã làm việc với Claude
- **Switch:** Chuyển đổi giữa các projects
- **Indicator:** Current active project

#### F5: Authentication
- **Method:** Token-based (configured in .env)
- **Flow:** Enter token → validate → access granted
- **Persistence:** Token saved in localStorage

### 5.2 v2 (Future)

| Feature | Description |
|---------|-------------|
| **Git Integration** | View diff, staged changes, commit history |
| **Image Support** | Upload/paste screenshots for Claude |
| **MCP Tools Display** | Show available MCP tools |
| **Session History** | Browse past conversations |
| **Multi-tab** | Multiple chat sessions |

---

## 6. UI/UX Design

### 6.1 Layout (Desktop)

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo] Claude Remote    [Project: my-app ▼]    [Settings]  │
├────────────────┬────────────────────────────────────────────┤
│                │                                            │
│  File Explorer │              Chat Panel                    │
│                │                                            │
│  📁 src/       │  ┌────────────────────────────────────┐   │
│    📄 index.ts │  │ User: Fix the bug in auth.ts       │   │
│    📄 app.ts   │  │                                    │   │
│  📁 tests/     │  │ Claude: I'll analyze the file...   │   │
│                │  │ [streaming...]                     │   │
│                │  └────────────────────────────────────┘   │
│                │                                            │
│                │  ┌────────────────────────────────────┐   │
│                │  │ Terminal Output                    │   │
│                │  │ $ cat src/auth.ts                  │   │
│                │  │ > Reading file...                  │   │
│                │  └────────────────────────────────────┘   │
│                │                                            │
│                │  [Type your message...          ] [Send]   │
└────────────────┴────────────────────────────────────────────┘
```

### 6.2 Layout (Mobile)

```
┌─────────────────────────┐
│ ☰  Claude Remote  ⚙️    │
├─────────────────────────┤
│ Project: my-app ▼       │
├─────────────────────────┤
│                         │
│   Chat Messages         │
│   (scrollable)          │
│                         │
│   [Terminal] [Files]    │  ← Toggle tabs
│                         │
├─────────────────────────┤
│ [Message input...] [➤]  │
└─────────────────────────┘
```

### 6.3 Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Mobile-first** | Design for small screens, enhance for desktop |
| **Dark mode default** | Developer-friendly, matches terminal aesthetic |
| **Minimal chrome** | Focus on content, hide unnecessary UI |
| **Keyboard-friendly** | Shortcuts for common actions |

---

## 7. API Design

### 7.1 WebSocket Events

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `auth` | `{ token: string }` | Authenticate connection |
| `message` | `{ content: string }` | Send message to Claude |
| `project:switch` | `{ path: string }` | Switch active project |
| `file:read` | `{ path: string }` | Request file content |
| `session:resume` | `{ sessionId: string }` | Resume existing session |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `auth:success` | `{ user: object }` | Auth successful |
| `auth:error` | `{ message: string }` | Auth failed |
| `message:chunk` | `{ content: string }` | Streaming response chunk |
| `message:done` | `{ id: string }` | Message complete |
| `terminal:output` | `{ content: string }` | Terminal output |
| `file:content` | `{ path, content }` | File content response |
| `project:list` | `{ projects: array }` | Available projects |

### 7.2 REST Endpoints (optional, for initial load)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects` | List all projects |
| `GET` | `/api/projects/:id/files` | Get file tree |
| `GET` | `/api/health` | Server health check |

---

## 8. Security Considerations

| Concern | Mitigation |
|---------|------------|
| **Unauthorized access** | Token authentication required |
| **Token exposure** | HTTPS recommended, token in header not URL |
| **Local network** | Bind to localhost by default |
| **File access** | Restricted to project directories only |

---

## 9. Project Structure

```
claude-remote/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── FileExplorer.tsx
│   │   │   ├── TerminalOutput.tsx
│   │   │   ├── ProjectSelector.tsx
│   │   │   └── Layout.tsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   └── useAuth.ts
│   │   ├── stores/
│   │   │   └── appStore.ts    # Zustand store
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── server/                    # Bun backend
│   ├── src/
│   │   ├── index.ts           # Entry point
│   │   ├── websocket.ts       # WebSocket handlers
│   │   ├── claude/
│   │   │   ├── sdk.ts         # Claude SDK integration
│   │   │   └── session.ts     # Session management
│   │   ├── services/
│   │   │   ├── project.ts     # Project operations
│   │   │   └── file.ts        # File operations
│   │   └── middleware/
│   │       └── auth.ts        # Authentication
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                    # Shared types
│   └── types.ts
│
├── .env.example
├── package.json               # Workspace root
└── README.md
```

---

## 10. Development Phases

### Phase 1: Foundation (MVP Core)
1. Project setup (monorepo, Bun, configs)
2. Basic backend with WebSocket
3. Claude SDK integration
4. Simple chat UI

### Phase 2: Features (MVP Complete)
5. File explorer
6. Terminal output
7. Project selector
8. Authentication

### Phase 3: Polish
9. Mobile responsive
10. Error handling
11. Loading states
12. Documentation

---

## 11. Success Criteria

| Criteria | Measurement |
|----------|-------------|
| **Functional** | Can chat with Claude, see files, see terminal output |
| **Responsive** | Usable on iPhone screen |
| **Persistent** | Can resume session after closing browser |
| **Fast** | Response streaming visible < 500ms |

---

## Appendix: Research Findings

### Claude Agent SDK
- Package: `@anthropic-ai/claude-agent-sdk`
- Bundled with Claude CLI
- Supports streaming responses
- TypeScript native

### Existing Solutions Reviewed
- [CloudCLI](https://github.com/siteboon/claudecodeui)
- [claude-code-webui](https://github.com/sugyan/claude-code-webui)
- [claude-code-web](https://github.com/vultuk/claude-code-web)

### Key Insight
Anthropic acquired Bun (Nov 2025) - Bun is the official runtime for Claude Code ecosystem.
