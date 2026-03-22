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
        const folderStats = await stat(claudeFolderPath);
        if (!folderStats.isDirectory()) continue;

        // Try sessions-index.json first for original path
        let projectPath: string | null = null;
        try {
          const indexPath = join(claudeFolderPath, "sessions-index.json");
          const indexContent = await readFile(indexPath, "utf-8");
          const indexData: SessionsIndex = JSON.parse(indexContent);
          if (indexData.originalPath) {
            projectPath = indexData.originalPath;
          }
        } catch {
          // No index — derive path from folder name
        }

        // Fallback: convert folder name back to path
        // e.g. "-Users-thawng-Desktop-source-AI-claude-remote" → "/Users/thawng/Desktop/source/AI/claude-remote"
        if (!projectPath) {
          projectPath = entry.replace(/^-/, "/").replace(/-/g, "/");
        }

        // Verify the path exists
        try {
          const pathStats = await stat(projectPath);
          if (!pathStats.isDirectory()) continue;
        } catch {
          continue; // Path no longer exists
        }

        // Find latest modified file in the claude project folder
        let latestModified = new Date(0);
        try {
          const projectFiles = await readdir(claudeFolderPath);
          for (const file of projectFiles) {
            if (file.startsWith(".")) continue;
            try {
              const fileStats = await stat(join(claudeFolderPath, file));
              if (fileStats.mtime > latestModified) {
                latestModified = fileStats.mtime;
              }
            } catch { /* skip */ }
          }
        } catch { /* use folder mtime */ }

        if (latestModified.getTime() === 0) {
          latestModified = folderStats.mtime;
        }

        projects.push({
          id: Buffer.from(projectPath).toString("base64"),
          name: basename(projectPath),
          path: projectPath,
          lastModified: latestModified.toISOString(),
        });
      } catch {
        // Skip inaccessible folders
      }
    }
  } catch {
    // Claude projects directory doesn't exist
  }

  // Sort by last modified (most recent first)
  projects.sort((a, b) => {
    if (!a.lastModified || !b.lastModified) return 0;
    return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
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
