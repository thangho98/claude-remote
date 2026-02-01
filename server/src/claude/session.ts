interface Session {
  id: string;
  workingDirectory: string;
  createdAt: Date;
  lastActivity: Date;
}

const sessions = new Map<string, Session>();

export function createSession(workingDirectory: string): Session {
  const session: Session = {
    id: crypto.randomUUID(),
    workingDirectory,
    createdAt: new Date(),
    lastActivity: new Date(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function updateSessionActivity(id: string): void {
  const session = sessions.get(id);
  if (session) {
    session.lastActivity = new Date();
  }
}

export function getOrCreateSession(workingDirectory: string): Session {
  // Find existing session for this directory
  for (const session of sessions.values()) {
    if (session.workingDirectory === workingDirectory) {
      session.lastActivity = new Date();
      return session;
    }
  }
  return createSession(workingDirectory);
}

export function deleteSession(id: string): boolean {
  return sessions.delete(id);
}

export function cleanupOldSessions(maxAge: number = 1000 * 60 * 60): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivity.getTime() > maxAge) {
      sessions.delete(id);
    }
  }
}

// Cleanup old sessions every hour
setInterval(() => cleanupOldSessions(), 1000 * 60 * 60);
