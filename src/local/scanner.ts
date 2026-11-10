import { lstatSync, readdirSync } from "node:fs";
import { join, basename, relative, sep } from "node:path";
import { canonicalDirectory, readRegularFile, statWithin } from "./paths.js";
import { isWorktreeRoot, runWorktreeGit } from "./worktree.js";

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
  return runWorktreeGit(repoPath, args)?.trim() || null;
}

function getRepoMeta(repoPath: string): ScannedRepo {
  const rawRemote = gitCmd(repoPath, ["remote", "get-url", "origin"]);
  const remote = rawRemote ? sanitizeRemoteUrl(rawRemote) : null;
  const lastLog = gitCmd(repoPath, [
    "log",
    "--no-show-signature",
    "-1",
    "--format=%aI|||%s",
  ]);
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
  try {
    lstatSync(ignorePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const content = readRegularFile(rootDir, ignorePath, 1024 * 1024);
  if (content === null) throw new Error(`Could not safely read ${ignorePath}`);
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function matchesIgnore(
  repoPath: string,
  rootDir: string,
  patterns: string[]
): boolean {
  const rel = relative(rootDir, repoPath).split(sep).join("/");
  const name = basename(repoPath);
  return patterns.some((p) => {
    const isRelativePath = p.includes("/");
    if (!p.includes("*")) return isRelativePath ? rel.includes(p) : name === p;
    const pattern = p
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    return new RegExp(`^${pattern}$`).test(isRelativePath ? rel : name);
  });
}

export function scanForRepos(
  rootDir: string,
  maxDepth: number = 3,
  excludePatterns: string[] = [],
  rootIsCanonical = false
): ScannedRepo[] {
  const candidateRoot = rootIsCanonical ? rootDir : canonicalDirectory(rootDir);
  if (
    !candidateRoot ||
    !statWithin(candidateRoot, candidateRoot)?.isDirectory()
  )
    return [];
  const root = candidateRoot;
  const repos: ScannedRepo[] = [];
  const ignorePatterns = [...loadIgnorePatterns(root), ...excludePatterns];

  function walk(dir: string, depth: number) {
    if (depth > maxDepth || !statWithin(root, dir)?.isDirectory()) return;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    if (entries.some((entry) => entry.name === ".git") && isWorktreeRoot(dir)) {
      if (!matchesIgnore(dir, root, ignorePatterns))
        repos.push(getRepoMeta(dir));
      return; // don't descend into git repos
    }

    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.name.startsWith(".") ||
        entry.name === "node_modules" ||
        entry.name === "vendor"
      )
        continue;
      walk(join(dir, entry.name), depth + 1);
    }
  }

  walk(root, 0);
  repos.sort((a, b) => {
    if (!a.lastCommitDate && !b.lastCommitDate) return 0;
    if (!a.lastCommitDate) return 1;
    if (!b.lastCommitDate) return -1;
    return b.lastCommitDate.localeCompare(a.lastCommitDate);
  });

  return repos;
}
