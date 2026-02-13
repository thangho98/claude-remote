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

        // Get all files in project folder and find the latest modified
        let latestModified = new Date(0);
        try {
          const projectFiles = await readdir(claudeFolderPath);
          for (const file of projectFiles) {
            if (file.startsWith(".")) continue;
            const filePath = join(claudeFolderPath, file);
            try {
              const fileStats = await stat(filePath);
              if (fileStats.mtime > latestModified) {
                latestModified = fileStats.mtime;
              }
            } catch {
              // Skip files we can't stat
            }
          }
        } catch {
          // Fallback to folder mtime if readdir fails
        }

        // If no files found or readdir failed, use folder mtime
        if (latestModified.getTime() === 0) {
          latestModified = stats.mtime;
        }

        projects.push({
          id: Buffer.from(projectPath).toString("base64"),
          name: basename(projectPath),
          path: projectPath,
          lastModified: latestModified.toISOString(),
        });
      } catch {
        // Skip if sessions-index.json doesn't exist or is invalid
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
