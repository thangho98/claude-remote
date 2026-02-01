import { readdir, readFile } from "fs/promises";
import { join } from "path";
import type { SlashCommand } from "../../../shared/types";

// Built-in Claude Code commands
const BUILTIN_COMMANDS: SlashCommand[] = [
  { name: "help", description: "Show available commands", source: "builtin" },
  { name: "clear", description: "Clear conversation history", source: "builtin" },
  { name: "compact", description: "Compact conversation to save context", source: "builtin" },
  { name: "config", description: "View/modify configuration", source: "builtin" },
  { name: "cost", description: "Show token usage and cost", source: "builtin" },
  { name: "doctor", description: "Check Claude Code health", source: "builtin" },
  { name: "init", description: "Initialize CLAUDE.md in project", source: "builtin" },
  { name: "login", description: "Switch account or auth method", source: "builtin" },
  { name: "logout", description: "Sign out", source: "builtin" },
  { name: "memory", description: "Edit CLAUDE.md memory files", source: "builtin" },
  { name: "model", description: "Switch AI model", source: "builtin" },
  { name: "permissions", description: "Manage tool permissions", source: "builtin" },
  { name: "review", description: "Code review current changes", source: "builtin" },
  { name: "status", description: "Show current session info", source: "builtin" },
  { name: "vim", description: "Toggle Vim mode", source: "builtin" },
];

/**
 * Parse SKILL.md frontmatter to get name and description
 */
async function parseSkillFile(filePath: string): Promise<{ name: string; description: string } | null> {
  try {
    const content = await readFile(filePath, "utf-8");

    // Parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return null;

    const frontmatter = frontmatterMatch[1];

    // Extract name and description
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

    if (!nameMatch) return null;

    return {
      name: nameMatch[1].trim(),
      description: descMatch ? descMatch[1].trim() : "",
    };
  } catch {
    return null;
  }
}

/**
 * List project-level commands from .claude/commands/ and .claude/skills/
 */
async function listProjectCommands(workingDirectory: string): Promise<SlashCommand[]> {
  const commands: SlashCommand[] = [];

  // Check .claude/commands/*.md (legacy)
  const commandsDir = join(workingDirectory, ".claude", "commands");
  try {
    const files = await readdir(commandsDir);
    for (const file of files) {
      if (file.endsWith(".md")) {
        const name = file.replace(".md", "");
        const content = await readFile(join(commandsDir, file), "utf-8");
        const firstLine = content.split("\n")[0].replace(/^#\s*/, "").trim();
        commands.push({
          name,
          description: firstLine || `Custom command: ${name}`,
          source: "project",
        });
      }
    }
  } catch {
    // Directory doesn't exist
  }

  // Check .claude/skills/*/SKILL.md
  const skillsDir = join(workingDirectory, ".claude", "skills");
  try {
    const dirs = await readdir(skillsDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (dir.isDirectory()) {
        const skillFile = join(skillsDir, dir.name, "SKILL.md");
        const skill = await parseSkillFile(skillFile);
        if (skill) {
          commands.push({
            name: skill.name,
            description: skill.description,
            source: "project",
          });
        }
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return commands;
}

/**
 * List user-level commands from ~/.claude/commands/ and ~/.claude/skills/
 */
async function listUserCommands(): Promise<SlashCommand[]> {
  const commands: SlashCommand[] = [];
  const home = process.env.HOME || "";

  // Check ~/.claude/commands/*.md
  const commandsDir = join(home, ".claude", "commands");
  try {
    const files = await readdir(commandsDir);
    for (const file of files) {
      if (file.endsWith(".md")) {
        const name = file.replace(".md", "");
        commands.push({
          name,
          description: `User command: ${name}`,
          source: "user",
        });
      }
    }
  } catch {
    // Directory doesn't exist
  }

  // Check ~/.claude/skills/*/SKILL.md
  const skillsDir = join(home, ".claude", "skills");
  try {
    const dirs = await readdir(skillsDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (dir.isDirectory()) {
        const skillFile = join(skillsDir, dir.name, "SKILL.md");
        const skill = await parseSkillFile(skillFile);
        if (skill) {
          commands.push({
            name: skill.name,
            description: skill.description,
            source: "user",
          });
        }
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return commands;
}

/**
 * Get all available slash commands
 */
export async function listCommands(workingDirectory?: string): Promise<SlashCommand[]> {
  const commands: SlashCommand[] = [...BUILTIN_COMMANDS];

  // Add user commands
  const userCommands = await listUserCommands();
  commands.push(...userCommands);

  // Add project commands if directory specified
  if (workingDirectory) {
    const projectCommands = await listProjectCommands(workingDirectory);
    commands.push(...projectCommands);
  }

  // Sort: builtin first, then alphabetically
  commands.sort((a, b) => {
    if (a.source !== b.source) {
      const order = { builtin: 0, project: 1, user: 2 };
      return order[a.source] - order[b.source];
    }
    return a.name.localeCompare(b.name);
  });

  return commands;
}
