import { readdir, stat, readFile } from "fs/promises";
import { join, basename } from "path";
import type { Project } from "../../../shared/types";

// Claude CLI stores projects in ~/.claude/projects/
const CLAUDE_PROJECTS_DIR = process.env.HOME
  ? join(process.env.HOME, ".claude", "projects")
  : null;

interface SessionsIndex {
  originalPath?: string;
  entries?: Array<{
    modified?: string;
    projectPath?: string;
  }>;
}

export async function listProjects(): Promise<Project[]> {
  const projects: Project[] = [];

  if (!CLAUDE_PROJECTS_DIR) {
    return projects;
  }

  try {
    const entries = await readdir(CLAUDE_PROJECTS_DIR);

    for (const entry of entries) {
      const claudeFolderPath = join(CLAUDE_PROJECTS_DIR, entry);

      try {
        // Read sessions-index.json to get the original path
        const indexPath = join(claudeFolderPath, "sessions-index.json");
        const indexContent = await readFile(indexPath, "utf-8");
        const indexData: SessionsIndex = JSON.parse(indexContent);

        const projectPath = indexData.originalPath;
        if (!projectPath) continue;

        // Verify the path still exists
        const stats = await stat(projectPath);
        if (!stats.isDirectory()) continue;

        // Get last modified from sessions or folder mtime
        let lastAccessed: string;
        if (indexData.entries && indexData.entries.length > 0) {
          // Find the most recent session
          const sortedEntries = indexData.entries
            .filter((e) => e.modified)
            .sort((a, b) => new Date(b.modified!).getTime() - new Date(a.modified!).getTime());
          lastAccessed = sortedEntries[0]?.modified || stats.mtime.toISOString();
        } else {
          lastAccessed = stats.mtime.toISOString();
        }

        projects.push({
          id: Buffer.from(projectPath).toString("base64"),
          name: basename(projectPath),
          path: projectPath,
          lastAccessed,
        });
      } catch {
        // Skip if sessions-index.json doesn't exist or is invalid
      }
    }
  } catch {
    // Claude projects directory doesn't exist
  }

  // Sort by last accessed (most recent first)
  projects.sort((a, b) => {
    if (!a.lastAccessed || !b.lastAccessed) return 0;
    return new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime();
  });

  return projects;
}

export function getProjectById(id: string): string | null {
  try {
    return Buffer.from(id, "base64").toString("utf-8");
  } catch {
    return null;
  }
}
