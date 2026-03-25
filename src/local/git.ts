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

export interface LocalCommit {
  sha: string;
  message: string;
  date: string;
  author: string;
}

export interface AuthorSummary {
  name: string;
  commits: number;
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  lastCommitDate: string | null;
}

export interface GitLogResult {
  repoPath: string;
  repoName: string;
  remote: string | null;
  defaultBranch: string | null;
  totalCommits: number;
  commits: LocalCommit[];
  authors: AuthorSummary[];
  branches: BranchInfo[];
  firstCommitDate: string | null;
  lastCommitDate: string | null;
}

const SEPARATOR = "<<<SEP>>>";
const FIELD_SEP = "<<<F>>>";

function git(repoPath: string, args: string[]): string | null {
  const result = spawnSync("git", ["-C", repoPath, ...args], {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) return null;
  return result.stdout.trim() || null;
}

function parseCommits(raw: string): LocalCommit[] {
  if (!raw) return [];
  return raw
    .split(SEPARATOR)
    .filter(Boolean)
    .map((block) => {
      const [sha, message, date, author] = block.split(FIELD_SEP);
      return {
        sha: (sha ?? "").trim(),
        message: (message ?? "").split("\n")[0].trim().slice(0, 120),
        date: (date ?? "").trim(),
        author: (author ?? "").trim(),
      };
    });
}

function parseAuthors(raw: string): AuthorSummary[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      // shortlog -sn output: "   123\tName"
      const match = line.match(/^\s*(\d+)\t(.+?)\s*$/);
      if (!match) return null;
      return {
        name: match[2].trim(),
        commits: parseInt(match[1], 10),
      };
    })
    .filter((a): a is AuthorSummary => a !== null)
    .sort((a, b) => b.commits - a.commits);
}

function parseBranches(repoPath: string): BranchInfo[] {
  const raw = git(repoPath, [
    "branch",
    "--format=%(refname:short)|||%(HEAD)|||%(committerdate:iso-strict)",
  ]);
  if (!raw) return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, head, date] = line.split("|||");
      return {
        name: name ?? "",
        isCurrent: head?.trim() === "*",
        lastCommitDate: date || null,
      };
    });
}

export function getGitLog(
  repoPath: string,
  maxCommits: number = 200
): GitLogResult {
  const repoName = repoPath.split("/").filter(Boolean).pop() ?? "unknown";

  const rawRemote = git(repoPath, ["remote", "get-url", "origin"]);
  const remote = rawRemote ? sanitizeRemoteUrl(rawRemote) : null;
  const defaultBranch =
    git(repoPath, ["symbolic-ref", "--short", "HEAD"]) ??
    git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);

  // Recent commits (no email — only sha, subject, date, author name)
  const format = `${SEPARATOR}%H${FIELD_SEP}%s${FIELD_SEP}%aI${FIELD_SEP}%an`;
  const rawLog = git(repoPath, [
    "log",
    `--format=${format}`,
    "-n",
    String(maxCommits),
    "--all",
  ]);
  const commits = parseCommits(rawLog ?? "");

  // Author summary (name + count only, no email — using -sn not -sne)
  const rawShortlog = git(repoPath, ["shortlog", "-sn", "--all"]);
  const authors = parseAuthors(rawShortlog ?? "");

  // Total commit count (fast)
  const countStr = git(repoPath, ["rev-list", "--count", "--all"]);
  const totalCommits = countStr ? parseInt(countStr, 10) : commits.length;

  // Branches
  const branches = parseBranches(repoPath);

  // First and last commit dates
  const firstDate = git(repoPath, ["log", "--format=%aI", "--reverse", "--all", "-1"]);
  const lastDate = git(repoPath, ["log", "--format=%aI", "--all", "-1"]);

  return {
    repoPath,
    repoName,
    remote,
    defaultBranch,
    totalCommits,
    commits,
    authors,
    branches,
    firstCommitDate: firstDate,
    lastCommitDate: lastDate,
  };
}
