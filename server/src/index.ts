import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { validateToken } from "./middleware/auth";
import { createWebSocketHandlers, type WSData, getConnectionStats } from "./websocket";
import { listProjects } from "./services/project";

const PORT = process.env.PORT || 3001;

// Create Elysia app for HTTP routes
const app = new Elysia()
  .use(cors())
  .get("/", () => ({ status: "ok", name: "claude-remote" }))
  .get("/api/health", () => ({
    healthy: true,
    timestamp: new Date().toISOString(),
  }))
  .get("/api/projects", async () => {
    const projects = await listProjects();
    return { projects };
  })
  .get("/api/connections", () => {
    const connections = getConnectionStats();
    const projectRooms = new Map<string, number>();
    const sessionRooms = new Map<string, number>();

    connections.forEach((conn) => {
      if (conn.project) {
        projectRooms.set(conn.project, (projectRooms.get(conn.project) || 0) + 1);
      }
      if (conn.session) {
        sessionRooms.set(conn.session, (sessionRooms.get(conn.session) || 0) + 1);
      }
    });

    return {
      total: connections.length,
      connections,
      rooms: {
        projects: Object.fromEntries(projectRooms),
        sessions: Object.fromEntries(sessionRooms),
      },
    };
  });

const wsHandlers = createWebSocketHandlers();

// Track server instance for graceful shutdown
let server: ReturnType<typeof Bun.serve<WSData>> | null = null;

// Graceful shutdown handler
function gracefulShutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  if (server) {
    server.stop(true); // true = close existing connections
    server = null;
  }
  process.exit(0);
}

// Register shutdown handlers
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGHUP", () => gracefulShutdown("SIGHUP"));

// Handle uncaught errors to ensure cleanup
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  gracefulShutdown("uncaughtException");
});

// Start server with retry logic for port conflict
async function startServer(retries = 3): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // If there's an existing server, stop it first
      if (server) {
        console.log("🔄 Stopping existing server...");
        server.stop(true);
        server = null;
        // Small delay to ensure port is released
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      server = Bun.serve<WSData>({
        port: PORT,
        reusePort: true, // Allow port reuse for faster restarts

        fetch(req, bunServer) {
          const url = new URL(req.url);

          // WebSocket upgrade
          if (url.pathname === "/ws") {
            const token = url.searchParams.get("token");

            if (!validateToken(token)) {
              return new Response("Unauthorized", { status: 401 });
            }

            const upgraded = bunServer.upgrade(req, {
              data: {
                authenticated: true,
                workingDirectory: process.env.DEFAULT_PROJECT_DIR || null, // Set when project is selected
                currentSessionId: null,
              },
            });

            if (upgraded) return undefined;
            return new Response("WebSocket upgrade failed", { status: 500 });
          }

          // Regular HTTP requests handled by Elysia
          return app.handle(req);
        },

        websocket: wsHandlers,
      });

      console.log(`🚀 Server running on http://localhost:${server.port}`);
      console.log(`🔌 WebSocket available at ws://localhost:${server.port}/ws`);
      return;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("EADDRINUSE") &&
        attempt < retries
      ) {
        console.log(
          `⚠️ Port ${PORT} in use, retrying in 500ms... (attempt ${attempt}/${retries})`
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else {
        throw error;
      }
    }
  }
}

// Start the server
startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
