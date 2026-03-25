import { resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import { scanForRepos } from "../local/scanner.js";

export interface ScanReposOptions {
  depth?: number;
}

export function scanRepos(dir: string | undefined, opts: ScanReposOptions) {
  const rootDir = resolve(dir ?? ".");
  const depth = opts.depth ?? 3;

  const spinner = ora({
    text: chalk.dim(`Scanning ${rootDir} (depth: ${depth})`),
    stream: process.stderr,
  }).start();

  const repos = scanForRepos(rootDir, depth);

  spinner.succeed(chalk.white(`Found ${repos.length} repositories`));

  process.stdout.write(JSON.stringify(repos, null, 2) + "\n");
}
