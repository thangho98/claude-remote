import { readdir, stat, readFile } from "fs/promises";
import { join, basename, resolve } from "path";
import type { FileNode } from "../../../shared/types";

export async function getFileTree(rootPath: string, maxDepth = 3): Promise<FileNode> {
  return buildFileTree(rootPath, 0, maxDepth);
}

async function buildFileTree(
  currentPath: string,
  depth: number,
  maxDepth: number
): Promise<FileNode> {
  const name = basename(currentPath) || currentPath;
  const stats = await stat(currentPath);

  if (!stats.isDirectory()) {
    return { name, path: currentPath, type: "file" };
  }

  const node: FileNode = { name, path: currentPath, type: "directory" };

  if (depth >= maxDepth) {
    return node;
  }

  try {
    const entries = await readdir(currentPath);
    const children: FileNode[] = [];

    for (const entry of entries) {
      // Skip hidden files and common ignored directories
      if (entry.startsWith(".") || entry === "node_modules" || entry === "dist") {
        continue;
      }

      const childPath = join(currentPath, entry);
      try {
        const child = await buildFileTree(childPath, depth + 1, maxDepth);
        children.push(child);
      } catch {
        // Skip files we can't access
      }
    }

    // Sort: directories first, then files, alphabetically
    children.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    node.children = children;
  } catch {
    // Can't read directory
  }

  return node;
}

export async function readFileContent(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath, "utf-8");
    return content;
  } catch (error) {
    throw new Error(`Cannot read file: ${filePath}`);
  }
}

export function isPathSafe(basePath: string, targetPath: string): boolean {
  // Prevent directory traversal attacks
  // Normalize paths to handle .. and . components
  const resolvedBase = resolve(basePath);
  const resolvedTarget = resolve(targetPath);
  return resolvedTarget.startsWith(resolvedBase);
}
