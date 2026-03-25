import { resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import { getGitLog } from "../local/git.js";
import { readDependencyFiles, readCodeBlobs } from "../local/files.js";

export interface GitLogOptions {
  commits?: number;
  blobs?: number;
}

export function gitLog(repoPath: string, opts: GitLogOptions) {
  const fullPath = resolve(repoPath);

  const spinner = ora({
    text: chalk.dim(`Analyzing ${fullPath}`),
    stream: process.stderr,
  }).start();

  const log = getGitLog(fullPath, opts.commits ?? 200);
  const deps = readDependencyFiles(fullPath);
  const codeBlobs = readCodeBlobs(fullPath, opts.blobs ?? 15);

  spinner.succeed(
    chalk.white(
      `${log.totalCommits} commits, ${log.authors.length} authors, ${log.branches.length} branches, ${codeBlobs.length} code files`
    )
  );

  const result = {
    ...log,
    dependencyFiles: deps,
    codeBlobs,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
