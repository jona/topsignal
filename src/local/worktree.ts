import { spawnSync } from "node:child_process";
import { isAbsolute, join, sep } from "node:path";
import { canonicalDirectory, statWithin } from "./paths.js";

export function runWorktreeGit(
  repoPath: string,
  args: string[]
): string | null {
  const env = { ...process.env };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_IMPLICIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_CONFIG",
    "GIT_CONFIG_COUNT",
    "GIT_CONFIG_PARAMETERS",
  ]) {
    delete env[key];
  }

  const result = spawnSync(
    "git",
    ["-C", repoPath, "-c", "core.fsmonitor=false", ...args],
    {
      env,
      maxBuffer: 10 * 1024 * 1024,
    }
  );
  if (result.status !== 0 || result.error) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      result.stdout
    );
  } catch {
    return null;
  }
}

export function isWorktreeRoot(repoPath: string): boolean {
  const marker = statWithin(repoPath, join(repoPath, ".git"));
  if (!marker?.isDirectory() && !marker?.isFile()) return false;

  const root = runWorktreeGit(repoPath, ["rev-parse", "--show-toplevel"]);
  return !!root && canonicalDirectory(root.replace(/\r?\n$/, "")) === repoPath;
}

export function trackedRegularFiles(repoPath: string): Set<string> {
  if (!isWorktreeRoot(repoPath)) return new Set();
  const index = runWorktreeGit(repoPath, [
    "ls-files",
    "--cached",
    "--stage",
    "-z",
  ]);
  const files = new Set<string>();

  for (const entry of index?.split("\0") ?? []) {
    const match = /^100(?:644|755) [\da-f]+ 0\t([\s\S]+)$/.exec(entry);
    if (!match) continue;
    const path = match[1];
    if (isAbsolute(path) || (sep === "\\" && path.includes("\\"))) continue;
    const parts = path.split("/");
    if (
      parts.some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.toLowerCase() === ".git"
      )
    ) {
      continue;
    }
    files.add(path);
  }

  return files;
}
