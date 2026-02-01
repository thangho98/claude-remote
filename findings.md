# Claude Remote - Research Findings

> Technical discoveries and decisions for the project

---

## Claude Agent SDK

### Installation
```bash
bun add @anthropic-ai/claude-agent-sdk
```

### Key Facts
- Bundled with Claude Code CLI (but need npm install for programmatic use)
- Supports TypeScript natively
- Streaming responses built-in
- Available tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch

### Usage Pattern
```typescript
import { query, ClaudeAgentOptions } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Your task here",
  options: {
    allowedTools: ["Read", "Edit", "Bash"],
    workingDirectory: "/path/to/project"
  }
})) {
  if ("content" in message) {
    // Streaming chunk
  }
  if ("result" in message) {
    // Final result
  }
}
```

### Session Management
- SDK manages sessions internally
- Can specify working directory per session
- Tool permissions configurable

---

## Bun WebSocket

### Why Native WebSocket
- Built on uWebSockets (C++ library)
- 13x faster than Node.js ws/socket.io
- Native to Bun, no extra dependencies

### Server Pattern
```typescript
Bun.serve({
  port: 3001,
  fetch(req, server) {
    const url = new URL(req.url);

    // Upgrade to WebSocket
    if (url.pathname === "/ws") {
      const token = req.headers.get("authorization");
      if (validateToken(token)) {
        server.upgrade(req, { data: { authenticated: true } });
        return;
      }
      return new Response("Unauthorized", { status: 401 });
    }

    // Regular HTTP
    return new Response("Claude Remote API");
  },
  websocket: {
    open(ws) {
      console.log("Client connected");
    },
    message(ws, message) {
      // Handle messages
    },
    close(ws) {
      console.log("Client disconnected");
    }
  }
});
```

---

## Hono Framework

### Why Hono
- Ultrafast (100k+ req/sec)
- Bun-native
- Excellent TypeScript support
- Middleware ecosystem

### Integration with Bun WebSocket
```typescript
import { Hono } from "hono";

const app = new Hono();

// REST endpoints
app.get("/api/projects", (c) => {
  return c.json({ projects: [] });
});

// Export for Bun.serve
export default {
  port: 3001,
  fetch: app.fetch,
  websocket: { /* handlers */ }
};
```

---

## Existing Solutions Reviewed

### 1. CloudCLI (siteboon/claudecodeui)
- Full WebUI with file explorer, git, terminal
- Uses subprocess approach
- Good reference for UI patterns

### 2. claude-code-webui (sugyan)
- Simpler chat interface
- Streaming responses
- Good reference for WebSocket patterns

### 3. claude-code-web (vultuk)
- Multi-session support
- Token auth (v2.0+)
- Good reference for auth flow

### Key Learnings
- All use subprocess `claude -p` approach
- We're using SDK instead (more control)
- WebSocket is standard for streaming

---

## Project Detection

### How Claude CLI Stores Projects
```bash
~/.claude/projects/
```

### Listing User's Projects
- Option 1: Read Claude config directory
- Option 2: Let user specify directories
- Option 3: Scan common dev directories

**Decision:** Start with user-specified directories via config

---

## Mobile Considerations

### Touch Targets
- Minimum 44x44px for buttons
- Adequate spacing between interactive elements

### Responsive Breakpoints
```css
/* Mobile first */
@media (min-width: 768px) { /* Tablet */ }
@media (min-width: 1024px) { /* Desktop */ }
```

### Layout Strategy
- Mobile: Single column, tabbed interface
- Tablet: Two columns (files | chat)
- Desktop: Three columns (files | chat | terminal)

---

## Security Notes

### Token Storage
- Server: .env file, never commit
- Client: localStorage (acceptable for personal tool)

### Network Security
- Bind to localhost by default
- Use Tailscale for remote access (encrypted)

### File Access
- Restrict to project directories only
- No access above project root

---

## Dependencies Summary

### Server
```json
{
  "dependencies": {
    "hono": "^4.x",
    "@anthropic-ai/claude-agent-sdk": "latest"
  }
}
```

### Client
```json
{
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x",
    "zustand": "^4.x",
    "react-markdown": "^9.x",
    "react-syntax-highlighter": "^15.x"
  },
  "devDependencies": {
    "vite": "^5.x",
    "@vitejs/plugin-react": "^4.x",
    "typescript": "^5.x",
    "tailwindcss": "^4.x",
    "@types/react": "^18.x"
  }
}
```
