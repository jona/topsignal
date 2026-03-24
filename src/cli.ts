#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import { VERSION } from "./env.js";
import { githubProfile } from "./commands/github-profile.js";
import { scanRepos } from "./commands/scan-repos.js";
import { gitLog } from "./commands/git-log.js";
import { analyze } from "./commands/analyze.js";
import { publish } from "./commands/publish.js";

function handleError(err: unknown): never {
  const e = err as { message?: string };
  process.stderr.write(`Error: ${e.message ?? "Unknown error"}\n`);
  process.exit(1);
}

const program = new Command();

program
  .name("topsignal")
  .description("Analyze developer profiles from local repos and GitHub")
  .version(VERSION);

program
  .command("github-profile")
  .description("Fetch and analyze a GitHub profile")
  .argument("[username]", "GitHub username (auto-detected if omitted)")
  .action(async (username?: string) => {
    try {
      await githubProfile({ username });
    } catch (err) {
      handleError(err);
    }
  });

program
  .command("scan-repos")
  .description("Find git repositories in a directory tree")
  .argument("[dir]", "Root directory to scan (defaults to cwd)")
  .option("-d, --depth <n>", "Max directory depth to scan", "3")
  .action((dir?: string, opts?: { depth?: string }) => {
    try {
      scanRepos(dir, { depth: opts?.depth ? parseInt(opts.depth, 10) : 3 });
    } catch (err) {
      handleError(err);
    }
  });

program
  .command("git-log")
  .description("Analyze a local git repository")
  .argument("<repo-path>", "Path to the git repository")
  .option("-n, --commits <n>", "Max commits to retrieve", "200")
  .option("-b, --blobs <n>", "Max code files to read", "15")
  .action((repoPath: string, opts?: { commits?: string; blobs?: string }) => {
    try {
      gitLog(repoPath, {
        commits: opts?.commits ? parseInt(opts.commits, 10) : 200,
        blobs: opts?.blobs ? parseInt(opts.blobs, 10) : 15,
      });
    } catch (err) {
      handleError(err);
    }
  });

program
  .command("analyze")
  .description(
    "Full profile analysis with AI — scans a local directory, optionally fetches GitHub data"
  )
  .argument("[username]", "GitHub username for remote data")
  .option("--dir <dir>", "Directory to scan for git repositories (defaults to cwd)")
  .option("-p, --provider <name>", "LLM provider (anthropic or openai)")
  .option("-m, --model <model>", "LLM model override")
  .option("-o, --output <file>", "Write JSON to file instead of stdout")
  .option("--prompts <dir>", "Directory with custom prompt templates")
  .option("-d, --depth <n>", "Max directory depth to scan", "3")
  .option("--stats", "Print analysis statistics after completion")
  .option("--repos <n>", "Max repos to fetch from GitHub")
  .option("--starred <n>", "Max starred repos to fetch")
  .option("--external-prs <n>", "Max external PRs to fetch")
  .option("--issues <n>", "Max issues to fetch")
  .option("--gists <n>", "Max gists to fetch")
  .option("--dep-repos <n>", "Repos to fetch dependency files from")
  .option("--commit-repos <n>", "Repos to fetch recent commits from")
  .option("--commits-per-repo <n>", "Commits to fetch per repo")
  .option("--blob-repos <n>", "Repos to sample code blobs from")
  .option("--files-per-blob <n>", "Code files to fetch per blob repo")
  .action(
    async (
      username: string | undefined,
      opts?: {
        dir?: string;
        provider?: string;
        model?: string;
        output?: string;
        prompts?: string;
        depth?: string;
        stats?: boolean;
        repos?: string;
        starred?: string;
        externalPrs?: string;
        issues?: string;
        gists?: string;
        depRepos?: string;
        commitRepos?: string;
        commitsPerRepo?: string;
        blobRepos?: string;
        filesPerBlob?: string;
      }
    ) => {
      try {
        const int = (v?: string) => (v ? parseInt(v, 10) : undefined);
        await analyze({
          username,
          dir: opts?.dir,
          provider: opts?.provider,
          model: opts?.model,
          output: opts?.output,
          prompts: opts?.prompts,
          depth: opts?.depth ? parseInt(opts.depth, 10) : 3,
          stats: opts?.stats,
          limits: {
            repos: int(opts?.repos),
            starred: int(opts?.starred),
            externalPrs: int(opts?.externalPrs),
            issues: int(opts?.issues),
            gists: int(opts?.gists),
            depFileRepos: int(opts?.depRepos),
            commitRepos: int(opts?.commitRepos),
            commitsPerRepo: int(opts?.commitsPerRepo),
            blobRepos: int(opts?.blobRepos),
            filesPerBlobRepo: int(opts?.filesPerBlob),
          },
        });
      } catch (err) {
        handleError(err);
      }
    }
  );

program
  .command("publish")
  .description("Publish a profile JSON to topsignal")
  .argument("<file>", "Path to the profile JSON file")
  .option("-u, --username <username>", "Username to publish as")
  .action(async (file: string, opts?: { username?: string }) => {
    try {
      await publish(file, { username: opts?.username });
    } catch (err) {
      handleError(err);
    }
  });

program.parse();
