import type { ServerWebSocket } from 'bun';
import type { WSData } from './websocket';

/**
 * WebSocket Room Management
 * Uses Bun's native pub/sub for efficient topic-based messaging
 *
 * Room naming conventions:
 * - project:{path} - Connections by working directory
 * - session:{id} - Connections by session ID
 */

export const ROOM_PREFIXES = {
  PROJECT: 'project:',
  SESSION: 'session:',
} as const;

/**
 * Subscribe a WebSocket connection to a room
 */
export function subscribeToRoom(
  ws: ServerWebSocket<WSData>,
  roomType: 'project' | 'session',
  id: string,
): void {
  const prefix = ROOM_PREFIXES[roomType.toUpperCase() as keyof typeof ROOM_PREFIXES];
  const roomName = `${prefix}${id}`;

  // Unsubscribe from previous room of same type
  if (roomType === 'project') {
    const currentProject = ws.data.workingDirectory;
    if (currentProject && currentProject !== id) {
      unsubscribeFromRoom(ws, 'project', currentProject);
    }
  } else if (roomType === 'session') {
    const currentSession = ws.data.currentSessionId;
    if (currentSession && currentSession !== id) {
      unsubscribeFromRoom(ws, 'session', currentSession);
    }
  }

  ws.subscribe(roomName);
  console.log(`📡 WS subscribed to ${roomType}: ${id}`);
}

/**
 * Unsubscribe a WebSocket connection from a room
 */
export function unsubscribeFromRoom(
  ws: ServerWebSocket<WSData>,
  roomType: 'project' | 'session',
  id: string,
): void {
  const prefix = ROOM_PREFIXES[roomType.toUpperCase() as keyof typeof ROOM_PREFIXES];
  const roomName = `${prefix}${id}`;

  ws.unsubscribe(roomName);
  console.log(`📡 WS unsubscribed from ${roomType}: ${id}`);
}

/**
 * Unsubscribe from all rooms when connection closes
 */
export function unsubscribeAll(ws: ServerWebSocket<WSData>): void {
  const { workingDirectory, currentSessionId } = ws.data;

  if (workingDirectory) {
    unsubscribeFromRoom(ws, 'project', workingDirectory);
  }
  if (currentSessionId) {
    unsubscribeFromRoom(ws, 'session', currentSessionId);
  }
}

/**
 * Publish a message to all subscribers in a room
 * Note: The sender must also be subscribed to receive the message
 */
export function publishToRoom(
  ws: ServerWebSocket<WSData>,
  roomType: 'project' | 'session',
  id: string,
  message: string,
): void {
  const prefix = ROOM_PREFIXES[roomType.toUpperCase() as keyof typeof ROOM_PREFIXES];
  const roomName = `${prefix}${id}`;

  ws.publish(roomName, message);
}

/**
 * Get room name for a connection's current project
 */
export function getProjectRoom(ws: ServerWebSocket<WSData>): string | null {
  return ws.data.workingDirectory ? `${ROOM_PREFIXES.PROJECT}${ws.data.workingDirectory}` : null;
}

/**
 * Get room name for a connection's current session
 */
export function getSessionRoom(ws: ServerWebSocket<WSData>): string | null {
  return ws.data.currentSessionId ? `${ROOM_PREFIXES.SESSION}${ws.data.currentSessionId}` : null;
}

/**
 * List all rooms a connection is subscribed to
 */
export function getSubscribedRooms(ws: ServerWebSocket<WSData>): {
  project: string | null;
  session: string | null;
} {
  return {
    project: ws.data.workingDirectory,
    session: ws.data.currentSessionId,
  };
}
