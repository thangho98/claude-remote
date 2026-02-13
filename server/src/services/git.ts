import type { GitStatusInfo, GitChange, GitDiffResult, GitDiffHunk, GitDiffLine, GitFileStatus } from '../../../shared/types';

// --- Git CLI Helpers ---

async function runGit(workingDirectory: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(['git', ...args], {
    cwd: workingDirectory,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`git ${args[0]} failed: ${stderr.trim()}`);
  }

  return stdout;
}

// --- Public API ---

export async function isGitRepo(workingDirectory: string): Promise<boolean> {
  try {
    const result = await runGit(workingDirectory, ['rev-parse', '--is-inside-work-tree']);
    return result.trim() === 'true';
  } catch {
    return false;
  }
}

export async function getGitStatus(workingDirectory: string): Promise<GitStatusInfo> {
  try {
    const output = await runGit(workingDirectory, ['status', '--branch', '--porcelain=v2']);
    return parseStatusV2(output);
  } catch {
    return { branch: '', ahead: 0, behind: 0, isGitRepo: false };
  }
}

export async function getGitChanges(workingDirectory: string): Promise<GitChange[]> {
  const [statusOutput, numstatOutput] = await Promise.all([
    runGit(workingDirectory, ['status', '--porcelain=v1']),
    runGit(workingDirectory, ['diff', '--numstat']).catch(() => ''),
  ]);

  const changes = parseStatusPorcelain(statusOutput);
  const numstats = parseNumstat(numstatOutput);

  // Merge insertion/deletion counts into changes
  for (const change of changes) {
    const stat = numstats.get(change.path);
    if (stat) {
      change.insertions = stat.insertions;
      change.deletions = stat.deletions;
    }
  }

  return changes;
}

export async function getGitDiff(
  workingDirectory: string,
  filePath: string,
  staged?: boolean,
): Promise<GitDiffResult> {
  let rawDiff: string;

  try {
    if (staged) {
      rawDiff = await runGit(workingDirectory, ['diff', '--cached', '--', filePath]);
    } else {
      rawDiff = await runGit(workingDirectory, ['diff', '--', filePath]);
    }
  } catch {
    rawDiff = '';
  }

  // If no diff (e.g. untracked file), try diff against empty
  if (!rawDiff.trim()) {
    try {
      rawDiff = await runGit(workingDirectory, ['diff', '--no-index', '/dev/null', filePath]);
    } catch {
      // git diff --no-index exits with 1 when files differ, which is expected
      // Try to capture output anyway
      try {
        const proc = Bun.spawn(['git', 'diff', '--no-index', '/dev/null', filePath], {
          cwd: workingDirectory,
          stdout: 'pipe',
          stderr: 'pipe',
        });
        rawDiff = await new Response(proc.stdout).text();
        await proc.exited; // Don't check exit code - it's always 1 for --no-index with differences
      } catch {
        rawDiff = '';
      }
    }
  }

  return parseDiff(rawDiff, filePath);
}

// --- Parsers ---

function parseStatusV2(output: string): GitStatusInfo {
  const info: GitStatusInfo = {
    branch: '',
    ahead: 0,
    behind: 0,
    isGitRepo: true,
  };

  for (const line of output.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      info.branch = line.slice('# branch.head '.length);
    } else if (line.startsWith('# branch.upstream ')) {
      info.tracking = line.slice('# branch.upstream '.length);
    } else if (line.startsWith('# branch.ab ')) {
      const match = line.match(/\+(\d+) -(\d+)/);
      if (match) {
        info.ahead = parseInt(match[1], 10);
        info.behind = parseInt(match[2], 10);
      }
    }
  }

  return info;
}

const STATUS_MAP: Record<string, GitFileStatus> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'modified', // copied treated as modified
  '?': 'untracked',
  U: 'conflicted',
};

function parseStatusPorcelain(output: string): GitChange[] {
  const changes: GitChange[] = [];

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;

    const xy = line.slice(0, 2);
    const rest = line.slice(3);

    // Handle renames: "R  old -> new"
    if (xy.startsWith('R') || xy.endsWith('R')) {
      const parts = rest.split(' -> ');
      if (parts.length === 2) {
        changes.push({
          path: parts[1],
          oldPath: parts[0],
          status: 'renamed',
          staged: xy[0] !== ' ' && xy[0] !== '?',
        });
        continue;
      }
    }

    // Untracked files
    if (xy === '??') {
      changes.push({ path: rest, status: 'untracked', staged: false });
      continue;
    }

    // Conflicted files (UU, AA, DD, etc.)
    if (xy[0] === 'U' || xy[1] === 'U' || (xy[0] === 'A' && xy[1] === 'A') || (xy[0] === 'D' && xy[1] === 'D')) {
      changes.push({ path: rest, status: 'conflicted', staged: false });
      continue;
    }

    // Staged changes (index column)
    if (xy[0] !== ' ' && xy[0] !== '?') {
      changes.push({
        path: rest,
        status: STATUS_MAP[xy[0]] || 'modified',
        staged: true,
      });
    }

    // Working tree changes (worktree column)
    if (xy[1] !== ' ' && xy[1] !== '?') {
      // Don't duplicate if already added as staged with same status
      const alreadyAdded = changes.find((c) => c.path === rest && c.staged);
      if (!alreadyAdded) {
        changes.push({
          path: rest,
          status: STATUS_MAP[xy[1]] || 'modified',
          staged: false,
        });
      }
    }
  }

  return changes;
}

function parseNumstat(output: string): Map<string, { insertions: number; deletions: number }> {
  const stats = new Map<string, { insertions: number; deletions: number }>();

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length >= 3) {
      const insertions = parts[0] === '-' ? 0 : parseInt(parts[0], 10);
      const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10);
      stats.set(parts[2], { insertions, deletions });
    }
  }

  return stats;
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

function parseDiff(rawDiff: string, filePath: string): GitDiffResult {
  if (!rawDiff.trim()) {
    return { path: filePath, hunks: [], isBinary: false, rawDiff: '' };
  }

  // Check for binary
  if (rawDiff.includes('Binary files') && rawDiff.includes('differ')) {
    return { path: filePath, hunks: [], isBinary: true, rawDiff };
  }

  const hunks: GitDiffHunk[] = [];
  let currentHunk: GitDiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of rawDiff.split('\n')) {
    const hunkMatch = line.match(HUNK_HEADER_RE);

    if (hunkMatch) {
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldLines: parseInt(hunkMatch[2] || '1', 10),
        newStart: parseInt(hunkMatch[3], 10),
        newLines: parseInt(hunkMatch[4] || '1', 10),
        header: line,
        lines: [],
      };
      hunks.push(currentHunk);
      oldLine = currentHunk.oldStart;
      newLine = currentHunk.newStart;
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      const diffLine: GitDiffLine = {
        type: 'add',
        content: line.slice(1),
        newLineNumber: newLine++,
      };
      currentHunk.lines.push(diffLine);
    } else if (line.startsWith('-')) {
      const diffLine: GitDiffLine = {
        type: 'remove',
        content: line.slice(1),
        oldLineNumber: oldLine++,
      };
      currentHunk.lines.push(diffLine);
    } else if (line.startsWith(' ')) {
      const diffLine: GitDiffLine = {
        type: 'context',
        content: line.slice(1),
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
      };
      currentHunk.lines.push(diffLine);
    }
    // Skip diff headers (---, +++, diff --git, index, etc.)
  }

  return { path: filePath, hunks, isBinary: false, rawDiff };
}
