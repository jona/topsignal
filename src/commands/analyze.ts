import { resolve, relative } from "node:path";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { getGhToken } from "../github/auth.js";
import { fetchGithubData } from "../github/fetcher/index.js";
import { resolveLimits, type FetchLimits } from "../limits.js";
import { createProvider } from "../llm/provider.js";
import { setPromptsDir } from "../analyzers/prompts.js";
import { runPipeline } from "../pipeline.js";
import { scanForRepos } from "../local/scanner.js";
import { getGitLog } from "../local/git.js";
import { readDependencyFiles, readCodeBlobs } from "../local/files.js";
import type { LocalRepoSummary } from "../types.js";
import { computeStats } from "../stats.js";
import { renderStats } from "../ui/stats-display.js";
import { withSpinner } from "../ui/spinner.js";
import ora from "ora";
import chalk from "chalk";

export interface AnalyzeOptions {
  dir?: string;
  username: string;
  provider?: string;
  model?: string;
  output?: string;
  prompts?: string;
  depth?: number;
  exclude?: string[];
  yes?: boolean;
  stats?: boolean;
  limits?: Partial<FetchLimits>;
}

async function confirmSend(
  blobCount: number,
  depCount: number,
  localRepos: string[],
  remoteRepos: string[],
  providerName: string
): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const totalRepos = localRepos.length + remoteRepos.length;
  const lines = [
    chalk.yellow(
      "\nAbout to send to " + providerName + " using your API keys:"
    ),
    `  - ${blobCount} source code file(s) from ${totalRepos} repo(s)`,
    `  - ${depCount} dependency manifest(s)`,
    "",
  ];
  if (remoteRepos.length > 0) {
    lines.push(chalk.dim("  GitHub repos:"));
    for (const name of remoteRepos) lines.push(chalk.dim(`    - ${name}`));
  }
  if (localRepos.length > 0) {
    lines.push(chalk.dim("  Local repos:"));
    for (const name of localRepos) lines.push(chalk.dim(`    - ${name}`));
  }
  lines.push("");
  for (const l of lines) process.stderr.write(l + "\n");
  return new Promise((resolve) => {
    rl.question("Continue? [y/N] ", (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

export async function analyze(opts: AnalyzeOptions) {
  const dir = opts.dir ? resolve(opts.dir) : undefined;
  const depth = opts.depth ?? 3;

  if (opts.prompts) {
    setPromptsDir(opts.prompts);
  }

  // LLM setup (optional)
  let llm;
  {
    const spinner = ora({
      text: chalk.dim("Detecting LLM provider"),
      stream: process.stderr,
    }).start();
    try {
      llm = await createProvider(opts.provider);
      spinner.succeed(chalk.white(`Using ${llm.name} for AI analysis`));
    } catch {
      spinner.info(chalk.dim("No LLM provider"));
    }
  }

  // Scan local repos (only when --dir is provided)
  let repoSummaries: LocalRepoSummary[] = [];
  if (dir) {
    const scannedRepos = await withSpinner(
      `Scanning ${dir} for git repositories (depth: ${depth})`,
      () => Promise.resolve(scanForRepos(dir, depth, opts.exclude))
    );

    repoSummaries = await withSpinner(
      `Reading local data from ${scannedRepos.length} repositories`,
      () =>
        Promise.resolve(
          scannedRepos.map((scanned) => {
            const gitLog = getGitLog(scanned.path);
            const dependencyFiles = readDependencyFiles(scanned.path);
            const codeBlobs = readCodeBlobs(scanned.path);
            return {
              path: scanned.path,
              name: scanned.name,
              remote: scanned.remote,
              totalCommits: gitLog.totalCommits,
              firstCommitDate: gitLog.firstCommitDate,
              lastCommitDate: gitLog.lastCommitDate,
              authors: gitLog.authors,
              branches: gitLog.branches,
              commits: gitLog.commits,
              dependencyFiles,
              codeBlobs,
            } as LocalRepoSummary;
          })
        )
    );
  }

  let statsBlobs: Parameters<typeof computeStats>[0] = [];
  let statsDeps: Parameters<typeof computeStats>[1] = [];
  let statsLocalRepos: string[] = [];
  let statsRemoteRepos: string[] = [];

  const token = getGhToken();
  const username = opts.username;

  const limits = resolveLimits(opts.limits);
  const { wave1, wave2 } = await withSpinner(
    `Fetching GitHub data for ${username}`,
    () => fetchGithubData(token, username, limits)
  );

  // Supplement wave2 with local repos not already present from GitHub
  const wave2RepoNames = new Set(wave2.codeBlobs.map((b) => b.repoName));
  const wave2DepRepos = new Set(wave2.dependencyFiles.map((d) => d.repoName));
  let addedBlobs = 0;

  for (const repo of repoSummaries) {
    if (!wave2RepoNames.has(repo.name)) {
      wave2.codeBlobs.push(...repo.codeBlobs);
      addedBlobs += repo.codeBlobs.length;
    }
    if (!wave2DepRepos.has(repo.name)) {
      wave2.dependencyFiles.push(repo.dependencyFiles);
    }
  }

  if (addedBlobs > 0) {
    ora({ stream: process.stderr }).info(
      chalk.dim(
        `Added ${addedBlobs} local code blobs from ${repoSummaries.length} local repos`
      )
    );
  }

  statsBlobs = wave2.codeBlobs;
  statsDeps = wave2.dependencyFiles;
  statsRemoteRepos = wave1.repos.map((r) => r.name);
  statsLocalRepos = repoSummaries.map((r) => r.name);

  // Consent check before sending data to LLM
  if (llm && !opts.yes) {
    const ok = await confirmSend(
      wave2.codeBlobs.length,
      wave2.dependencyFiles.length,
      statsLocalRepos,
      statsRemoteRepos,
      llm.name
    );
    if (!ok) {
      ora({ stream: process.stderr }).warn(chalk.yellow("Aborted by user"));
      process.exit(0);
    }
  }

  const profile = await runPipeline({
    wave1,
    wave2,
    llm,
    model: opts.model,
  });

  // Strip absolute filesystem paths from local repo data
  if (dir && "repos" in profile && Array.isArray((profile as any).repos)) {
    for (const repo of (profile as any).repos) {
      if (typeof repo.path === "string" && repo.path.startsWith("/")) {
        repo.path = relative(dir, repo.path) || repo.name;
      }
    }
  }

  const json = JSON.stringify(profile, null, 2);

  if (opts.output) {
    await withSpinner(`Writing output to ${opts.output}`, () =>
      Promise.resolve(writeFileSync(opts.output!, json + "\n"))
    );
  } else {
    process.stdout.write(json + "\n");
  }

  if (opts.stats) {
    const stats = computeStats(
      statsBlobs,
      statsDeps,
      statsLocalRepos,
      statsRemoteRepos
    );
    await renderStats(stats);
  }
}
