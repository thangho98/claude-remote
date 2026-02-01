# Claude Remote - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a web interface for Claude Code CLI that works on mobile

**Architecture:** Monorepo with Bun backend (Hono + WebSocket) and React frontend (Vite). Claude Agent SDK for AI integration. Real-time streaming via native Bun WebSocket.

**Tech Stack:** Bun, Hono, React, Vite, TypeScript, Tailwind CSS, Zustand, Claude Agent SDK

---

## Task 1: Initialize Monorepo

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`

**Step 1: Create root package.json**

```json
{
  "name": "claude-remote",
  "private": true,
  "workspaces": ["server", "client", "shared"],
  "scripts": {
    "dev": "bun run --filter '*' dev",
    "dev:server": "bun run --filter server dev",
    "dev:client": "bun run --filter client dev"
  }
}
```

**Step 2: Create .gitignore**

```gitignore
node_modules/
dist/
.env
*.log
.DS_Store
```

**Step 3: Create .env.example**

```env
# Server
PORT=3001
AUTH_TOKEN=your-secret-token-here

# Claude
ANTHROPIC_API_KEY=your-api-key
```

**Step 4: Initialize git**

Run: `git init && git add -A && git commit -m "chore: initialize monorepo"`

---

## Task 2: Setup Server Package

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/index.ts`

**Step 1: Create server/package.json**

```json
{
  "name": "server",
  "version": "0.1.0",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts"
  },
  "dependencies": {
    "hono": "^4.7.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

**Step 2: Create server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["bun"]
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create server/src/index.ts**

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("/*", cors());

app.get("/", (c) => c.json({ status: "ok", name: "claude-remote" }));

app.get("/api/health", (c) => c.json({ healthy: true }));

const server = Bun.serve({
  port: process.env.PORT || 3001,
  fetch: app.fetch,
});

console.log(`Server running on http://localhost:${server.port}`);
```

**Step 4: Install dependencies and test**

Run: `cd server && bun install && bun run dev`
Expected: Server starts on port 3001

**Step 5: Commit**

```bash
git add server/
git commit -m "feat(server): initialize Bun + Hono server"
```

---

## Task 3: Setup Client Package

**Files:**
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`
- Create: `client/src/index.css`

**Step 1: Create client/package.json**

```json
{
  "name": "client",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

**Step 2: Create client/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

**Step 3: Create client/vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
});
```

**Step 4: Create client/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claude Remote</title>
  </head>
  <body class="bg-gray-900 text-white">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 5: Create client/src/main.tsx**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Step 6: Create client/src/App.tsx**

```tsx
function App() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <h1 className="text-3xl font-bold">Claude Remote</h1>
    </div>
  );
}

export default App;
```

**Step 7: Create client/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 8: Create client/tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

**Step 9: Create client/postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

**Step 10: Install and test**

Run: `cd client && bun install && bun run dev`
Expected: Vite starts on port 5173, shows "Claude Remote"

**Step 11: Commit**

```bash
git add client/
git commit -m "feat(client): initialize React + Vite + Tailwind"
```

---

## Task 4: Setup Shared Types

**Files:**
- Create: `shared/package.json`
- Create: `shared/types.ts`

**Step 1: Create shared/package.json**

```json
{
  "name": "shared",
  "version": "0.1.0",
  "main": "types.ts",
  "types": "types.ts"
}
```

**Step 2: Create shared/types.ts**

```typescript
// WebSocket Events
export type WSClientEvent =
  | { type: "auth"; token: string }
  | { type: "message"; content: string }
  | { type: "project:switch"; path: string }
  | { type: "file:read"; path: string }
  | { type: "session:resume"; sessionId: string };

export type WSServerEvent =
  | { type: "auth:success"; user: { authenticated: boolean } }
  | { type: "auth:error"; message: string }
  | { type: "message:chunk"; content: string; id: string }
  | { type: "message:done"; id: string }
  | { type: "message:error"; error: string; id: string }
  | { type: "terminal:output"; content: string }
  | { type: "file:content"; path: string; content: string }
  | { type: "project:list"; projects: Project[] };

// Domain Types
export interface Project {
  id: string;
  name: string;
  path: string;
  lastAccessed?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export interface AppState {
  authenticated: boolean;
  currentProject: Project | null;
  projects: Project[];
  messages: Message[];
  files: FileNode[];
  terminalOutput: string[];
  isConnected: boolean;
  isLoading: boolean;
}
```

**Step 3: Commit**

```bash
git add shared/
git commit -m "feat(shared): add shared types"
```

---

## Task 5: Add WebSocket to Server

**Files:**
- Modify: `server/src/index.ts`
- Create: `server/src/websocket.ts`
- Create: `server/src/middleware/auth.ts`

**Step 1: Create server/src/middleware/auth.ts**

```typescript
export function validateToken(token: string | null): boolean {
  const expectedToken = process.env.AUTH_TOKEN;
  if (!expectedToken) {
    console.warn("AUTH_TOKEN not set, allowing all connections");
    return true;
  }
  return token === expectedToken;
}
```

**Step 2: Create server/src/websocket.ts**

```typescript
import type { ServerWebSocket } from "bun";
import type { WSClientEvent, WSServerEvent } from "../../shared/types";

interface WSData {
  authenticated: boolean;
}

export function createWebSocketHandlers() {
  return {
    open(ws: ServerWebSocket<WSData>) {
      console.log("WebSocket client connected");
    },

    message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
      try {
        const event: WSClientEvent = JSON.parse(message.toString());
        handleEvent(ws, event);
      } catch (error) {
        console.error("Invalid message:", error);
        send(ws, { type: "message:error", error: "Invalid message format", id: "" });
      }
    },

    close(ws: ServerWebSocket<WSData>) {
      console.log("WebSocket client disconnected");
    },
  };
}

function handleEvent(ws: ServerWebSocket<WSData>, event: WSClientEvent) {
  switch (event.type) {
    case "auth":
      // Auth is handled during upgrade, just confirm
      send(ws, { type: "auth:success", user: { authenticated: true } });
      break;

    case "message":
      handleMessage(ws, event.content);
      break;

    case "project:switch":
      // TODO: Implement project switching
      break;

    case "file:read":
      // TODO: Implement file reading
      break;

    default:
      console.warn("Unknown event type:", event);
  }
}

async function handleMessage(ws: ServerWebSocket<WSData>, content: string) {
  const id = crypto.randomUUID();

  // For now, echo back as a simple test
  send(ws, { type: "message:chunk", content: `Received: ${content}`, id });
  send(ws, { type: "message:done", id });
}

function send(ws: ServerWebSocket<WSData>, event: WSServerEvent) {
  ws.send(JSON.stringify(event));
}

export type { WSData };
```

**Step 3: Update server/src/index.ts**

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { validateToken } from "./middleware/auth";
import { createWebSocketHandlers, type WSData } from "./websocket";

const app = new Hono();

app.use("/*", cors());

app.get("/", (c) => c.json({ status: "ok", name: "claude-remote" }));
app.get("/api/health", (c) => c.json({ healthy: true }));

const wsHandlers = createWebSocketHandlers();

const server = Bun.serve<WSData>({
  port: process.env.PORT || 3001,

  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const token = url.searchParams.get("token");

      if (!validateToken(token)) {
        return new Response("Unauthorized", { status: 401 });
      }

      const upgraded = server.upgrade(req, {
        data: { authenticated: true },
      });

      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // Regular HTTP requests
    return app.fetch(req);
  },

  websocket: wsHandlers,
});

console.log(`Server running on http://localhost:${server.port}`);
console.log(`WebSocket available at ws://localhost:${server.port}/ws`);
```

**Step 4: Test WebSocket**

Run: `cd server && bun run dev`
Test with: Browser console or wscat

**Step 5: Commit**

```bash
git add server/
git commit -m "feat(server): add WebSocket with auth"
```

---

## Task 6: Create Client WebSocket Hook

**Files:**
- Create: `client/src/hooks/useWebSocket.ts`

**Step 1: Create useWebSocket hook**

```typescript
import { useEffect, useRef, useState, useCallback } from "react";
import type { WSClientEvent, WSServerEvent } from "../../../shared/types";

interface UseWebSocketOptions {
  token: string;
  onMessage?: (event: WSServerEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useWebSocket({ token, onMessage, onConnect, onDisconnect }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const data: WSServerEvent = JSON.parse(event.data);
        onMessage?.(data);
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      onDisconnect?.();
    };

    ws.onerror = () => {
      setError("WebSocket connection failed");
      setIsConnected(false);
    };
  }, [token, onMessage, onConnect, onDisconnect]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  const send = useCallback((event: WSClientEvent) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  }, []);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return { isConnected, error, connect, disconnect, send };
}
```

**Step 2: Commit**

```bash
git add client/
git commit -m "feat(client): add useWebSocket hook"
```

---

## Task 7: Create Zustand Store

**Files:**
- Create: `client/src/stores/appStore.ts`

**Step 1: Install zustand**

Run: `cd client && bun add zustand`

**Step 2: Create appStore.ts**

```typescript
import { create } from "zustand";
import type { AppState, Message, Project, FileNode } from "../../../shared/types";

interface AppStore extends AppState {
  // Auth
  setAuthenticated: (authenticated: boolean) => void;

  // Connection
  setConnected: (connected: boolean) => void;

  // Projects
  setProjects: (projects: Project[]) => void;
  setCurrentProject: (project: Project | null) => void;

  // Messages
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  setMessageDone: (id: string) => void;
  clearMessages: () => void;

  // Files
  setFiles: (files: FileNode[]) => void;

  // Terminal
  addTerminalOutput: (output: string) => void;
  clearTerminal: () => void;

  // Loading
  setLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  // Initial state
  authenticated: false,
  isConnected: false,
  currentProject: null,
  projects: [],
  messages: [],
  files: [],
  terminalOutput: [],
  isLoading: false,

  // Auth
  setAuthenticated: (authenticated) => set({ authenticated }),

  // Connection
  setConnected: (isConnected) => set({ isConnected }),

  // Projects
  setProjects: (projects) => set({ projects }),
  setCurrentProject: (currentProject) => set({ currentProject }),

  // Messages
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
  setFiles: (files) => set({ files }),

  // Terminal
  addTerminalOutput: (output) =>
    set((state) => ({ terminalOutput: [...state.terminalOutput, output] })),

  clearTerminal: () => set({ terminalOutput: [] }),

  // Loading
  setLoading: (isLoading) => set({ isLoading }),
}));
```

**Step 3: Commit**

```bash
git add client/
git commit -m "feat(client): add Zustand store"
```

---

## Task 8: Create Auth Screen

**Files:**
- Create: `client/src/components/AuthScreen.tsx`
- Modify: `client/src/App.tsx`

**Step 1: Create AuthScreen.tsx**

```tsx
import { useState } from "react";

interface AuthScreenProps {
  onAuth: (token: string) => void;
  error?: string | null;
}

export function AuthScreen({ onAuth, error }: AuthScreenProps) {
  const [token, setToken] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (token.trim()) {
      onAuth(token.trim());
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-center text-white mb-8">
          Claude Remote
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="token" className="block text-sm font-medium text-gray-300 mb-2">
              Access Token
            </label>
            <input
              type="password"
              id="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your token"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Connect
          </button>
        </form>
      </div>
    </div>
  );
}
```

**Step 2: Update App.tsx**

```tsx
import { useState, useCallback } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useAppStore } from "./stores/appStore";
import { AuthScreen } from "./components/AuthScreen";
import type { WSServerEvent } from "../../shared/types";

function App() {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("claude-remote-token")
  );
  const [authError, setAuthError] = useState<string | null>(null);

  const { authenticated, setAuthenticated, setConnected } = useAppStore();

  const handleMessage = useCallback((event: WSServerEvent) => {
    switch (event.type) {
      case "auth:success":
        setAuthenticated(true);
        setAuthError(null);
        break;
      case "auth:error":
        setAuthError(event.message);
        setAuthenticated(false);
        break;
      // Handle other events...
    }
  }, [setAuthenticated]);

  const { isConnected, error, connect, send } = useWebSocket({
    token: token || "",
    onMessage: handleMessage,
    onConnect: () => {
      setConnected(true);
      send({ type: "auth", token: token || "" });
    },
    onDisconnect: () => {
      setConnected(false);
      setAuthenticated(false);
    },
  });

  const handleAuth = (newToken: string) => {
    setToken(newToken);
    localStorage.setItem("claude-remote-token", newToken);
    connect();
  };

  if (!token || !authenticated) {
    return <AuthScreen onAuth={handleAuth} error={authError || error} />;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="p-4">
        <h1 className="text-2xl font-bold">Claude Remote</h1>
        <p className="text-gray-400">Connected: {isConnected ? "Yes" : "No"}</p>
      </div>
    </div>
  );
}

export default App;
```

**Step 3: Test auth flow**

Run: `bun run dev` (from root)
Expected: See auth screen, enter token, connect

**Step 4: Commit**

```bash
git add client/
git commit -m "feat(client): add auth screen and connection flow"
```

---

## Task 9: Create Chat Interface

**Files:**
- Create: `client/src/components/ChatPanel.tsx`
- Create: `client/src/components/MessageList.tsx`
- Create: `client/src/components/MessageInput.tsx`
- Modify: `client/src/App.tsx`

**Step 1: Install markdown dependencies**

Run: `cd client && bun add react-markdown remark-gfm`

**Step 2: Create MessageList.tsx**

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "../../../shared/types";

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[80%] rounded-lg p-3 ${
              message.role === "user"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-100"
            }`}
          >
            {message.role === "assistant" ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                className="prose prose-invert prose-sm max-w-none"
              >
                {message.content}
              </ReactMarkdown>
            ) : (
              <p className="whitespace-pre-wrap">{message.content}</p>
            )}
            {message.isStreaming && (
              <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-1" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 3: Create MessageInput.tsx**

```tsx
import { useState, useRef, useEffect } from "react";

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim() && !disabled) {
      onSend(content.trim());
      setContent("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [content]);

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          disabled={disabled}
          rows={1}
          className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <button
          type="submit"
          disabled={disabled || !content.trim()}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          Send
        </button>
      </div>
    </form>
  );
}
```

**Step 4: Create ChatPanel.tsx**

```tsx
import { useRef, useEffect } from "react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import type { Message } from "../../../shared/types";

interface ChatPanelProps {
  messages: Message[];
  onSend: (content: string) => void;
  isLoading?: boolean;
}

export function ChatPanel({ messages, onSend, isLoading }: ChatPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        <MessageList messages={messages} />
      </div>
      <MessageInput onSend={onSend} disabled={isLoading} />
    </div>
  );
}
```

**Step 5: Update App.tsx to use ChatPanel**

```tsx
import { useState, useCallback } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useAppStore } from "./stores/appStore";
import { AuthScreen } from "./components/AuthScreen";
import { ChatPanel } from "./components/ChatPanel";
import type { WSServerEvent, Message } from "../../shared/types";

function App() {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("claude-remote-token")
  );
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    authenticated,
    setAuthenticated,
    setConnected,
    messages,
    addMessage,
    updateMessage,
    setMessageDone,
    isLoading,
    setLoading,
  } = useAppStore();

  const handleMessage = useCallback(
    (event: WSServerEvent) => {
      switch (event.type) {
        case "auth:success":
          setAuthenticated(true);
          setAuthError(null);
          break;
        case "auth:error":
          setAuthError(event.message);
          setAuthenticated(false);
          break;
        case "message:chunk":
          // Check if message exists, if not create it
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
        case "message:done":
          setMessageDone(event.id);
          setLoading(false);
          break;
        case "message:error":
          setLoading(false);
          // TODO: Show error
          break;
      }
    },
    [setAuthenticated, addMessage, updateMessage, setMessageDone, setLoading, messages]
  );

  const { isConnected, error, connect, send } = useWebSocket({
    token: token || "",
    onMessage: handleMessage,
    onConnect: () => {
      setConnected(true);
      send({ type: "auth", token: token || "" });
    },
    onDisconnect: () => {
      setConnected(false);
      setAuthenticated(false);
    },
  });

  const handleAuth = (newToken: string) => {
    setToken(newToken);
    localStorage.setItem("claude-remote-token", newToken);
    connect();
  };

  const handleSendMessage = (content: string) => {
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    addMessage(userMessage);
    setLoading(true);
    send({ type: "message", content });
  };

  if (!token || !authenticated) {
    return <AuthScreen onAuth={handleAuth} error={authError || error} />;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h1 className="text-xl font-bold">Claude Remote</h1>
        <span className={`text-sm ${isConnected ? "text-green-400" : "text-red-400"}`}>
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <ChatPanel messages={messages} onSend={handleSendMessage} isLoading={isLoading} />
      </main>
    </div>
  );
}

export default App;
```

**Step 6: Test chat**

Run: `bun run dev`
Expected: Can send messages, see echo response

**Step 7: Commit**

```bash
git add client/
git commit -m "feat(client): add chat interface with streaming"
```

---

## Task 10: Integrate Claude Agent SDK

**Files:**
- Modify: `server/package.json`
- Create: `server/src/claude/sdk.ts`
- Create: `server/src/claude/session.ts`
- Modify: `server/src/websocket.ts`

**Step 1: Install Claude Agent SDK**

Run: `cd server && bun add @anthropic-ai/claude-agent-sdk`

**Step 2: Create server/src/claude/sdk.ts**

```typescript
import { query, ClaudeAgentOptions } from "@anthropic-ai/claude-agent-sdk";

export interface ClaudeMessageHandler {
  onChunk: (content: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
  onToolUse?: (tool: string, input: string) => void;
}

export async function sendToClaudeSDK(
  prompt: string,
  workingDirectory: string,
  handlers: ClaudeMessageHandler
) {
  try {
    const options: ClaudeAgentOptions = {
      allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
      workingDirectory,
    };

    for await (const message of query({ prompt, options })) {
      // Handle different message types from SDK
      if ("content" in message && typeof message.content === "string") {
        handlers.onChunk(message.content);
      }

      if ("toolUse" in message) {
        handlers.onToolUse?.(message.toolUse.name, JSON.stringify(message.toolUse.input));
      }

      if ("result" in message) {
        handlers.onDone();
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    handlers.onError(errorMessage);
  }
}
```

**Step 3: Create server/src/claude/session.ts**

```typescript
interface Session {
  id: string;
  workingDirectory: string;
  createdAt: Date;
}

const sessions = new Map<string, Session>();

export function createSession(workingDirectory: string): Session {
  const session: Session = {
    id: crypto.randomUUID(),
    workingDirectory,
    createdAt: new Date(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function getOrCreateSession(workingDirectory: string): Session {
  // For now, create a new session per working directory
  for (const session of sessions.values()) {
    if (session.workingDirectory === workingDirectory) {
      return session;
    }
  }
  return createSession(workingDirectory);
}
```

**Step 4: Update server/src/websocket.ts**

```typescript
import type { ServerWebSocket } from "bun";
import type { WSClientEvent, WSServerEvent } from "../../shared/types";
import { sendToClaudeSDK } from "./claude/sdk";
import { getOrCreateSession } from "./claude/session";

interface WSData {
  authenticated: boolean;
  workingDirectory: string;
}

export function createWebSocketHandlers() {
  return {
    open(ws: ServerWebSocket<WSData>) {
      console.log("WebSocket client connected");
      // Set default working directory
      ws.data.workingDirectory = process.env.DEFAULT_PROJECT_DIR || process.cwd();
    },

    message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
      try {
        const event: WSClientEvent = JSON.parse(message.toString());
        handleEvent(ws, event);
      } catch (error) {
        console.error("Invalid message:", error);
        send(ws, { type: "message:error", error: "Invalid message format", id: "" });
      }
    },

    close(ws: ServerWebSocket<WSData>) {
      console.log("WebSocket client disconnected");
    },
  };
}

function handleEvent(ws: ServerWebSocket<WSData>, event: WSClientEvent) {
  switch (event.type) {
    case "auth":
      send(ws, { type: "auth:success", user: { authenticated: true } });
      break;

    case "message":
      handleMessage(ws, event.content);
      break;

    case "project:switch":
      ws.data.workingDirectory = event.path;
      console.log(`Switched to project: ${event.path}`);
      break;

    default:
      console.warn("Unknown event type:", event);
  }
}

async function handleMessage(ws: ServerWebSocket<WSData>, content: string) {
  const id = crypto.randomUUID();
  const session = getOrCreateSession(ws.data.workingDirectory);

  await sendToClaudeSDK(content, session.workingDirectory, {
    onChunk: (chunk) => {
      send(ws, { type: "message:chunk", content: chunk, id });
    },
    onDone: () => {
      send(ws, { type: "message:done", id });
    },
    onError: (error) => {
      send(ws, { type: "message:error", error, id });
    },
    onToolUse: (tool, input) => {
      send(ws, { type: "terminal:output", content: `[${tool}] ${input}` });
    },
  });
}

function send(ws: ServerWebSocket<WSData>, event: WSServerEvent) {
  ws.send(JSON.stringify(event));
}

export type { WSData };
```

**Step 5: Update .env.example**

```env
# Server
PORT=3001
AUTH_TOKEN=your-secret-token-here

# Claude
ANTHROPIC_API_KEY=your-api-key

# Projects
DEFAULT_PROJECT_DIR=/path/to/your/project
```

**Step 6: Test with Claude SDK**

Run: `cd server && bun run dev`
Note: Requires valid ANTHROPIC_API_KEY

**Step 7: Commit**

```bash
git add server/
git commit -m "feat(server): integrate Claude Agent SDK"
```

---

## Remaining Tasks (Phase 5-7)

The following tasks follow the same pattern. Implementation details are in [task_plan.md](../task_plan.md):

### Phase 5: File Explorer
- Task 11: Backend file service
- Task 12: FileExplorer component
- Task 13: FileViewer component

### Phase 6: Terminal Output
- Task 14: TerminalOutput component
- Task 15: ANSI color support

### Phase 7: Polish
- Task 16: Mobile responsive layout
- Task 17: Project selector
- Task 18: Error handling & reconnection
- Task 19: README & documentation

---

## Execution Options

**Plan complete and saved to `docs/plans/2026-02-01-claude-remote-impl.md`.**

**Two execution options:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
