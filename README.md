# Claude Remote

Web interface for Claude Code CLI - access from mobile or any browser.

## Features

- **Chat Interface** - Streaming responses from Claude
- **File Explorer** - Browse and view project files
- **Terminal Output** - See commands Claude executes
- **Project Selector** - Switch between multiple projects
- **Session Management** - List, switch, resume Claude sessions
- **Slash Commands** - Autocomplete for `/commands` with keyboard navigation
- **Mobile Responsive** - Works on iPhone, iPad, desktop (iOS Safari supported)
- **Dark Theme** - Developer-friendly interface
- **Provider Abstraction** - Switch between Claude CLI and SDK backends

## Prerequisites

- [Bun](https://bun.sh) runtime
- [Claude CLI](https://claude.ai/code) installed and authenticated
- Node.js 18+ (for some dependencies)

## Quick Start

1. **Clone and install**

```bash
cd claude-remote
bun install
```

2. **Configure environment**

```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3001
AUTH_TOKEN=your-secret-token-here
DEFAULT_PROJECT_DIR=/path/to/your/projects
```

3. **Start the server**

```bash
bun run dev
```

4. **Open in browser**

- Desktop: http://localhost:5555
- Mobile: Use your local IP (e.g. http://192.168.1.x:5555)

5. **Enter your token** and start chatting!

## Remote Access (Tailscale)

For secure remote access:

1. Install [Tailscale](https://tailscale.com) on your server and devices
2. Access via Tailscale IP: `http://100.x.x.x:5555`

## Project Structure

```
claude-remote/
├── client/              # React frontend (Vite)
│   └── src/
│       ├── components/  # UI components
│       ├── hooks/       # Custom React hooks
│       └── stores/      # Zustand state stores
├── server/              # Bun backend (Elysia + WebSocket)
│   └── src/
│       ├── claude/      # Claude integration
│       │   ├── providers/   # CLI & SDK implementations
│       │   └── types.ts     # Provider interface
│       ├── services/    # Business logic
│       └── middleware/  # Auth etc.
├── shared/              # Shared TypeScript types
│   └── types.ts         # WebSocket event types
├── .brain/              # Project knowledge (AI context)
└── docs/plans/          # Design & implementation specs
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite 6, TypeScript, Tailwind CSS |
| Backend | Bun, Elysia, WebSocket |
| State | Zustand 5 |
| Claude | CLI (default) or Agent SDK (via CLAUDE_PROVIDER env) |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3001 |
| `AUTH_TOKEN` | Authentication token | required |
| `DEFAULT_PROJECT_DIR` | Projects directory | ~/projects |
| `CLAUDE_PROVIDER` | `cli` or `sdk` | cli |

> Both providers use Claude CLI's OAuth authentication - no API key needed!

## Development

```bash
# Run both server and client
bun run dev

# Run server only
bun run dev:server

# Run client only
bun run dev:client

# Build for production
bun run build
```

## Security Notes

- Token authentication protects access
- Bind to localhost by default
- File access restricted to project directories
- Use Tailscale or VPN for remote access (not public internet)

## Troubleshooting

### Claude CLI not found

Make sure Claude CLI is installed and in your PATH:
```bash
which claude
claude --version
```

### WebSocket connection fails

Check that:
1. Server is running on correct port
2. Token matches between client and server
3. No firewall blocking WebSocket connections

### No projects found

Configure `DEFAULT_PROJECT_DIR` in `.env` or ensure projects exist in common directories:
- `~/projects`
- `~/code`
- `~/dev`

## License

MIT
