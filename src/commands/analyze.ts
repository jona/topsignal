import { resolve, relative } from "node:path";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { getGhToken } from "../github/auth.js";
import { fetchGithubData } from "../github/fetcher/index.js";
import { resolveLimits, type FetchLimits } from "../limits.js";
import { createProvider } from "../llm/provider.js";
import { setPromptsDir } from "../analyzers/prompts.js";
import { runPipeline, type ProviderPrompts } from "../pipeline.js";
import { scanForRepos } from "../local/scanner.js";
import { canonicalDirectory } from "../local/paths.js";
import { readDependencyFiles, readCodeBlobs } from "../local/files.js";
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
  prompts: Readonly<ProviderPrompts>,
  providerName: string,
  hasLocalRepos: boolean
): Promise<boolean> {
  process.stderr.write(
    "\nAbout to send data to " +
      providerName +
      " using your API key.\n" +
      (prompts.knowledge
        ? `  - Knowledge prompt: source files, manifests and docs from ${hasLocalRepos ? "GitHub and local repositories" : "GitHub repositories"}, plus contribution stats\n`
        : "") +
      "  - Overview prompt: GitHub profile fields and activity\n" +
      "Enter v to preview the prompts, or y to send. [y/N/v] "
  );

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      const answer = line.trim().toLowerCase();
      if (answer !== "v") return answer === "y";

      for (const [name, prompt] of Object.entries(prompts)) {
        if (!prompt) continue;
        // Escape terminal control characters while leaving the prompt readable.
        const printable = prompt.replace(
          /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g,
          (character) =>
            `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
        );
        process.stderr.write(`\n--- ${name} ---\n${printable}\n`);
      }
      process.stderr.write("\nSend these prompts? [y/N/v] ");
    }
    return false;
  } finally {
    rl.close();
  }
}

export async function analyze(opts: AnalyzeOptions) {
  const dir = opts.dir ? canonicalDirectory(resolve(opts.dir)) : undefined;
  if (opts.dir && !dir)
    throw new Error(
      "Scan root must be a readable directory and cannot be a symlink."
    );
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
  let localRepos: {
    name: string;
    dependencyFiles: ReturnType<typeof readDependencyFiles>;
    codeBlobs: ReturnType<typeof readCodeBlobs>;
  }[] = [];
  if (dir) {
    const scannedRepos = await withSpinner(
      `Scanning ${dir} for git repositories (depth: ${depth})`,
      () => Promise.resolve(scanForRepos(dir, depth, opts.exclude, true))
    );

    localRepos = await withSpinner(
      `Reading local data from ${scannedRepos.length} repositories`,
      () =>
        Promise.resolve(
          scannedRepos.map(({ name, path }) => ({
            name,
            dependencyFiles: readDependencyFiles(path, dir),
            codeBlobs: readCodeBlobs(path, undefined, dir),
          }))
        )
    );
  }

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

  for (const repo of localRepos) {
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
        `Added ${addedBlobs} local code blobs from ${localRepos.length} local repos`
      )
    );
  }

  const provider = llm;
  const profile = await runPipeline({
    wave1,
    wave2,
    llm: provider,
    model: opts.model,
    confirm:
      provider && !opts.yes
        ? (prompts) =>
            confirmSend(prompts, provider.name, localRepos.length > 0)
        : undefined,
  });
  if (!profile) {
    ora({ stream: process.stderr }).warn(chalk.yellow("Aborted by user"));
    return;
  }

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
      wave2.codeBlobs,
      wave2.dependencyFiles,
      localRepos.map((repo) => repo.name),
      wave1.repos.map((repo) => repo.name)
    );
    await renderStats(stats);
  }
}
