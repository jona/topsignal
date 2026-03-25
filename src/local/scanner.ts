import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { spawnSync } from "node:child_process";

function sanitizeRemoteUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = "";
      u.password = "";
      return u.toString();
    }
    return url;
  } catch {
    return url.replace(/\/\/[^@]+@/, "//");
  }
}

export interface ScannedRepo {
  path: string;
  name: string;
  remote: string | null;
  lastCommitDate: string | null;
  lastCommitMessage: string | null;
  defaultBranch: string | null;
  hasRemote: boolean;
}

function gitCmd(repoPath: string, args: string[]): string | null {
  const result = spawnSync("git", ["-C", repoPath, ...args], {
    encoding: "utf-8",
  });
  if (result.status !== 0 || result.error) return null;
  return result.stdout.trim() || null;
}

function getRepoMeta(repoPath: string): ScannedRepo {
  const rawRemote = gitCmd(repoPath, ["remote", "get-url", "origin"]);
  const remote = rawRemote ? sanitizeRemoteUrl(rawRemote) : null;
  const lastLog = gitCmd(repoPath, ["log", "-1", "--format=%aI|||%s"]);
  const branch =
    gitCmd(repoPath, ["symbolic-ref", "--short", "HEAD"]) ??
    gitCmd(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);

  let lastCommitDate: string | null = null;
  let lastCommitMessage: string | null = null;
  if (lastLog) {
    const [date, ...msgParts] = lastLog.split("|||");
    lastCommitDate = date ?? null;
    lastCommitMessage = msgParts.join("|||") || null;
  }

  return {
    path: repoPath,
    name: basename(repoPath),
    remote,
    lastCommitDate,
    lastCommitMessage,
    defaultBranch: branch,
    hasRemote: remote !== null,
  };
}

function loadIgnorePatterns(rootDir: string): string[] {
  const ignorePath = join(rootDir, ".topsignalignore");
  if (!existsSync(ignorePath)) return [];
  try {
    return readFileSync(ignorePath, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}

function matchesIgnore(repoPath: string, rootDir: string, patterns: string[]): boolean {
  const rel = repoPath.slice(rootDir.length + 1);
  const name = basename(repoPath);
  return patterns.some((p) => {
    if (p.includes("/")) return rel.includes(p);
    return name === p || name.match(new RegExp(`^${p.replace(/\*/g, ".*")}$`)) !== null;
  });
}

export function scanForRepos(
  rootDir: string,
  maxDepth: number = 3,
  excludePatterns: string[] = []
): ScannedRepo[] {
  const repos: ScannedRepo[] = [];
  const ignorePatterns = [...loadIgnorePatterns(rootDir), ...excludePatterns];

  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    if (entries.includes(".git")) {
      try {
        const gitStat = statSync(join(dir, ".git"));
        if (gitStat.isDirectory()) {
          if (ignorePatterns.length > 0 && matchesIgnore(dir, rootDir, ignorePatterns)) {
            return; // excluded by .topsignalignore or --exclude
          }
          repos.push(getRepoMeta(dir));
          return; // don't descend into git repos
        }
      } catch {
        // .git exists but not a dir (submodule worktree pointer), skip
      }
    }

    for (const entry of entries) {
      if (
        entry.startsWith(".") ||
        entry === "node_modules" ||
        entry === "vendor"
      )
        continue;
      const full = join(dir, entry);
      try {
        if (statSync(full).isDirectory()) {
          walk(full, depth + 1);
        }
      } catch {
        // permission denied or broken symlink
      }
    }
  }

  walk(rootDir, 0);
  repos.sort((a, b) => {
    if (!a.lastCommitDate && !b.lastCommitDate) return 0;
    if (!a.lastCommitDate) return 1;
    if (!b.lastCommitDate) return -1;
    return b.lastCommitDate.localeCompare(a.lastCommitDate);
  });

  return repos;
}
