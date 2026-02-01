import type { ServerWebSocket } from "bun";
import type { WSClientEvent, WSServerEvent } from "../../shared/types";
import { getFileTree, readFileContent, isPathSafe } from "./services/file";
import { listProjects } from "./services/project";
import { listSessions, getSessionInfo, getSessionMessages } from "./services/session";
import { sendToClaude } from "./claude/sdk";
import { getOrCreateSession } from "./claude/session";

export interface WSData {
  authenticated: boolean;
  workingDirectory: string | null; // Set when project is selected
  currentSessionId: string | null;
}

export function createWebSocketHandlers() {
  return {
    open(ws: ServerWebSocket<WSData>) {
      console.log("🔌 WebSocket client connected");
    },

    async message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
      try {
        const msgStr = message.toString();
        console.log("📩 Received WS message:", msgStr.slice(0, 100));
        const event: WSClientEvent = JSON.parse(msgStr);
        await handleEvent(ws, event);
      } catch (error) {
        console.error("Invalid message:", error);
        send(ws, { type: "message:error", error: "Invalid message format", id: "" });
      }
    },

    close(ws: ServerWebSocket<WSData>) {
      console.log("🔌 WebSocket client disconnected");
    },
  };
}

async function handleEvent(ws: ServerWebSocket<WSData>, event: WSClientEvent) {
  switch (event.type) {
    case "auth":
      send(ws, { type: "auth:success", user: { authenticated: true } });
      // Send project list on auth
      const projects = await listProjects();
      send(ws, { type: "project:list", projects });
      break;

    case "message":
      await handleMessage(ws, event.content);
      break;

    case "project:switch":
      ws.data.workingDirectory = event.path;
      console.log(`📁 Switched to project: ${event.path}`);
      // Send file tree for new project
      try {
        const tree = await getFileTree(event.path);
        send(ws, { type: "file:tree", path: event.path, tree });
        send(ws, {
          type: "project:current",
          project: { id: "", name: event.path.split("/").pop() || "", path: event.path },
        });
      } catch (error) {
        send(ws, { type: "message:error", error: "Failed to load project", id: "" });
      }
      break;

    case "file:read":
      await handleFileRead(ws, event.path);
      break;

    case "file:list":
      await handleFileList(ws, event.path);
      break;

    case "session:list":
      await handleSessionList(ws);
      break;

    case "session:switch":
      await handleSessionSwitch(ws, event.sessionId);
      break;

    default:
      console.warn("Unknown event type:", event);
  }
}

async function handleMessage(ws: ServerWebSocket<WSData>, content: string) {
  if (!ws.data.workingDirectory) {
    send(ws, { type: "message:error", error: "No project selected", id: "" });
    return;
  }

  const id = crypto.randomUUID();
  const session = getOrCreateSession(ws.data.workingDirectory);
  const sessionId = ws.data.currentSessionId;

  console.log(`💬 Message received in ${session.workingDirectory}: "${content.slice(0, 50)}..."${sessionId ? ` (resuming session ${sessionId})` : ""}`);

  try {
    await sendToClaude(
      content,
      session.workingDirectory,
      {
        onChunk: (chunk) => {
          send(ws, { type: "message:chunk", content: chunk, id });
        },
        onDone: () => {
          send(ws, { type: "message:done", id });
          console.log(`✅ Message ${id} completed`);
        },
        onError: (error) => {
          send(ws, { type: "message:error", error, id });
          console.error(`❌ Message ${id} error:`, error);
        },
        onToolUse: (tool, input) => {
          send(ws, { type: "terminal:output", content: `[${tool}] ${input}` });
        },
      },
      sessionId
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    send(ws, { type: "message:error", error: errorMessage, id });
    console.error(`❌ Failed to process message:`, error);
  }
}

async function handleFileRead(ws: ServerWebSocket<WSData>, path: string) {
  console.log(`📄 Reading file: ${path} (workingDir: ${ws.data.workingDirectory})`);
  try {
    // Security check
    if (ws.data.workingDirectory && !isPathSafe(ws.data.workingDirectory, path)) {
      console.warn(`⚠️ Access denied: ${path} not within ${ws.data.workingDirectory}`);
      send(ws, { type: "message:error", error: "Access denied", id: "" });
      return;
    }

    const content = await readFileContent(path);
    console.log(`✅ File read successfully: ${path} (${content.length} chars)`);
    send(ws, { type: "file:content", path, content });
  } catch (error) {
    console.error(`❌ Failed to read file: ${path}`, error);
    send(ws, { type: "message:error", error: `Failed to read file: ${path}`, id: "" });
  }
}

async function handleFileList(ws: ServerWebSocket<WSData>, path: string) {
  try {
    const tree = await getFileTree(path);
    send(ws, { type: "file:tree", path, tree });
  } catch (error) {
    send(ws, { type: "message:error", error: `Failed to list files: ${path}`, id: "" });
  }
}

async function handleSessionList(ws: ServerWebSocket<WSData>) {
  if (!ws.data.workingDirectory) {
    send(ws, { type: "session:list", sessions: [] });
    return;
  }

  try {
    const sessions = await listSessions(ws.data.workingDirectory);
    send(ws, { type: "session:list", sessions });
    console.log(`📋 Sent ${sessions.length} sessions for ${ws.data.workingDirectory}`);
  } catch (error) {
    console.error("Failed to list sessions:", error);
    send(ws, { type: "session:list", sessions: [] });
  }
}

async function handleSessionSwitch(ws: ServerWebSocket<WSData>, sessionId: string) {
  if (!ws.data.workingDirectory) {
    return;
  }

  ws.data.currentSessionId = sessionId;
  console.log(`🔄 Switched to session: ${sessionId}`);

  // Get session info and send it
  const info = await getSessionInfo(ws.data.workingDirectory, sessionId);
  if (info) {
    send(ws, { type: "session:info", model: info.model, usage: info.usage });
  }

  // Find session in list and send as current
  const sessions = await listSessions(ws.data.workingDirectory);
  const currentSession = sessions.find((s) => s.id === sessionId);
  if (currentSession) {
    send(ws, { type: "session:current", session: currentSession });
  }

  // Load and send session messages
  const rawMessages = await getSessionMessages(ws.data.workingDirectory, sessionId);
  const messages = rawMessages.map((m, i) => ({
    id: `${sessionId}-${i}`,
    role: m.role as "user" | "assistant",
    content: m.content,
    timestamp: m.timestamp,
  }));
  send(ws, { type: "session:messages", messages });
  console.log(`📨 Sent ${messages.length} messages for session ${sessionId}`);
}

function send(ws: ServerWebSocket<WSData>, event: WSServerEvent) {
  ws.send(JSON.stringify(event));
}

