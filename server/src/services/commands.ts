import { access, readdir, readFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import type { ChatProvider, SlashCommand } from "../../../shared/types";

const UNIVERSAL_COMMANDS: SlashCommand[] = [
  { name: "model", description: "Show or switch AI model", source: "builtin", kind: "builtin" },
];

// Claude-specific built-in commands
const CLAUDE_BUILTIN_COMMANDS: SlashCommand[] = [
  { name: "help", description: "Show available commands", source: "builtin", kind: "builtin" },
  { name: "clear", description: "Clear conversation history", source: "builtin", kind: "builtin" },
  { name: "compact", description: "Compact conversation to save context", source: "builtin", kind: "builtin" },
  { name: "config", description: "View/modify configuration", source: "builtin", kind: "builtin" },
  { name: "cost", description: "Show token usage and cost", source: "builtin", kind: "builtin" },
  { name: "doctor", description: "Check Claude Code health", source: "builtin", kind: "builtin" },
  { name: "init", description: "Initialize CLAUDE.md in project", source: "builtin", kind: "builtin" },
  { name: "login", description: "Switch account or auth method", source: "builtin", kind: "builtin" },
  { name: "logout", description: "Sign out", source: "builtin", kind: "builtin" },
  { name: "memory", description: "Edit CLAUDE.md memory files", source: "builtin", kind: "builtin" },
  { name: "permissions", description: "Manage tool permissions", source: "builtin", kind: "builtin" },
  { name: "review", description: "Code review current changes", source: "builtin", kind: "builtin" },
  { name: "status", description: "Show current session info", source: "builtin", kind: "builtin" },
  { name: "vim", description: "Toggle Vim mode", source: "builtin", kind: "builtin" },
];

function getProviderDirectoryName(provider: ChatProvider): ".claude" | ".codex" {
  return provider === "codex" ? ".codex" : ".claude";
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

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
      name: stripWrappingQuotes(nameMatch[1]),
      description: descMatch ? stripWrappingQuotes(descMatch[1]) : "",
    };
  } catch {
    return null;
  }
}

/**
 * Recursively find SKILL.md files under a skills directory.
 */
async function findSkillFiles(skillsDir: string): Promise<string[]> {
  const skillFiles: string[] = [];

  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(skillsDir, entry.name);

      if (entry.isDirectory()) {
        skillFiles.push(...await findSkillFiles(entryPath));
        continue;
      }

      if (entry.isFile() && entry.name === "SKILL.md") {
        skillFiles.push(entryPath);
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return skillFiles;
}

async function listMarkdownCommands(commandsDir: string, source: SlashCommand["source"]): Promise<SlashCommand[]> {
  const commands: SlashCommand[] = [];

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
          source,
          kind: "command",
        });
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return commands;
}

async function listSkillCommands(skillsDir: string, source: SlashCommand["source"]): Promise<SlashCommand[]> {
  const commands: SlashCommand[] = [];
  const skillFiles = await findSkillFiles(skillsDir);

  for (const skillFile of skillFiles) {
    const skill = await parseSkillFile(skillFile);
    if (skill) {
      commands.push({
        name: skill.name,
        description: skill.description,
        source,
        kind: "skill",
      });
    }
  }

  return commands;
}

async function listSkillCommandsFromRoots(
  skillsDirs: string[],
  source: SlashCommand["source"],
): Promise<SlashCommand[]> {
  const commands: SlashCommand[] = [];

  for (const skillsDir of skillsDirs) {
    commands.push(...await listSkillCommands(skillsDir, source));
  }

  return commands;
}

async function findRepoRoot(startDirectory: string): Promise<string | null> {
  let currentDirectory = resolve(startDirectory);

  while (true) {
    if (await pathExists(join(currentDirectory, ".git"))) {
      return currentDirectory;
    }

    const parentDirectory = dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return null;
    }

    currentDirectory = parentDirectory;
  }
}

function getDirectoriesFromCurrentToRoot(
  currentDirectory: string,
  rootDirectory: string | null,
): string[] {
  const directories: string[] = [];
  let directory = resolve(currentDirectory);

  while (true) {
    directories.push(directory);

    if (!rootDirectory || directory === rootDirectory) {
      break;
    }

    const parentDirectory = dirname(directory);
    if (parentDirectory === directory) {
      break;
    }

    directory = parentDirectory;
  }

  return directories;
}

async function getCodexProjectSkillRoots(workingDirectory: string): Promise<string[]> {
  const repoRoot = await findRepoRoot(workingDirectory);
  const repoScopedRoots = getDirectoriesFromCurrentToRoot(workingDirectory, repoRoot)
    .map((directory) => join(directory, ".agents", "skills"));

  return [
    ...repoScopedRoots,
    join(workingDirectory, ".codex", "skills"),
  ];
}

function getCodexUserSkillRoots(home: string): string[] {
  return [
    join(home, ".agents", "skills"),
    join(home, ".codex", "skills"),
    join("/etc", "codex", "skills"),
  ];
}

function dedupeCommands(commands: SlashCommand[]): SlashCommand[] {
  const seen = new Set<string>();
  const deduped: SlashCommand[] = [];

  for (const command of commands) {
    const key = `${command.source}:${command.kind}:${command.name.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(command);
  }

  return deduped;
}

/**
 * List project-level commands from provider-specific commands/skills directories.
 */
async function listProjectCommands(provider: ChatProvider, workingDirectory: string): Promise<SlashCommand[]> {
  const providerDir = getProviderDirectoryName(provider);
  const commandsDir = join(workingDirectory, providerDir, "commands");
  const skillRoots = provider === "codex"
    ? await getCodexProjectSkillRoots(workingDirectory)
    : [join(workingDirectory, providerDir, "skills")];
  const [markdownCommands, skillCommands] = await Promise.all([
    listMarkdownCommands(commandsDir, "project"),
    listSkillCommandsFromRoots(skillRoots, "project"),
  ]);

  return dedupeCommands([...markdownCommands, ...skillCommands]);
}

/**
 * List user-level commands from provider-specific commands/skills directories.
 */
async function listUserCommands(provider: ChatProvider): Promise<SlashCommand[]> {
  const home = process.env.HOME || "";
  const providerDir = getProviderDirectoryName(provider);
  const commandsDir = join(home, providerDir, "commands");
  const skillRoots = provider === "codex"
    ? getCodexUserSkillRoots(home)
    : [join(home, providerDir, "skills")];
  const [markdownCommands, skillCommands] = await Promise.all([
    listMarkdownCommands(commandsDir, "user"),
    listSkillCommandsFromRoots(skillRoots, "user"),
  ]);

  return dedupeCommands([...markdownCommands, ...skillCommands]);
}

/**
 * Get all available slash commands for the active provider.
 */
export async function listCommands(
  provider: ChatProvider,
  workingDirectory?: string,
): Promise<SlashCommand[]> {
  const commands: SlashCommand[] = [...UNIVERSAL_COMMANDS];

  if (provider === "claude") {
    commands.push(...CLAUDE_BUILTIN_COMMANDS);
  }

  // Add user commands
  const userCommands = await listUserCommands(provider);
  commands.push(...userCommands);

  // Add project commands if directory specified
  if (workingDirectory) {
    const projectCommands = await listProjectCommands(provider, workingDirectory);
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
