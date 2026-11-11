#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import { VERSION } from "../../env.js";
import { parseIntegerOption, type FetchLimits } from "../../limits.js";
import { githubProfile } from "../../commands/github-profile.js";
import { scanRepos } from "../../commands/scan-repos.js";
import { gitLog } from "../../commands/git-log.js";
import { attachAnalysis } from "../../commands/attach-analysis.js";
import { analysisSchema } from "../../analysis.js";
import { analysisPrompt } from "../../commands/analysis-prompt.js";
import { publish } from "../../commands/publish.js";
import { login } from "../../commands/login.js";
import { logout } from "../../commands/logout.js";

function handleError(err: unknown): never {
  const e = err as { message?: string };
  process.stderr.write(`Error: ${e.message ?? "Unknown error"}\n`);
  process.exit(1);
}

const program = new Command();

program
  .name("topsignal")
  .description(
    "Collect developer evidence and publish harness-analyzed profiles"
  )
  .version(VERSION);

program
  .command("github-profile")
  .description("Fetch raw GitHub profile data")
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
      scanRepos(dir, {
        depth: parseIntegerOption(opts?.depth ?? "3", "--depth", 0, 100),
      });
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
        commits: parseIntegerOption(
          opts?.commits ?? "200",
          "--commits",
          0,
          10000
        ),
        blobs: parseIntegerOption(opts?.blobs ?? "15", "--blobs", 0, 100),
      });
    } catch (err) {
      handleError(err);
    }
  });

program
  .command("collect")
  .alias("analyze")
  .description(
    "Collect GitHub profile data and private evidence for a calling harness"
  )
  .argument("<username>", "GitHub username for remote data")
  .option("--dir <dir>", "Directory to scan for Git-tracked repository files")
  .option("-o, --output <file>", "Write JSON to file instead of stdout")
  .option("-d, --depth <n>", "Max directory depth to scan", "3")
  .option(
    "--exclude <patterns>",
    "Comma-separated repo names or patterns to exclude from scanning"
  )
  .requiredOption(
    "--evidence <file>",
    "Write private source and Git evidence for the harness"
  )
  .option("--stats", "Print collection statistics after completion")
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
      username: string,
      opts?: {
        dir?: string;
        output?: string;
        evidence: string;
        depth?: string;
        exclude?: string;
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
        const limit = (name: string, value?: string, min = 1) =>
          value === undefined
            ? undefined
            : parseIntegerOption(value, name, min, 100);
        const limits: Partial<FetchLimits> = {
          repos: limit("--repos", opts?.repos),
          starred: limit("--starred", opts?.starred),
          externalPrs: limit("--external-prs", opts?.externalPrs),
          issues: limit("--issues", opts?.issues),
          gists: limit("--gists", opts?.gists),
          depFileRepos: limit("--dep-repos", opts?.depRepos, 0),
          commitRepos: limit("--commit-repos", opts?.commitRepos, 0),
          commitsPerRepo: limit("--commits-per-repo", opts?.commitsPerRepo),
          blobRepos: limit("--blob-repos", opts?.blobRepos, 0),
          filesPerBlobRepo: limit("--files-per-blob", opts?.filesPerBlob, 0),
        };
        const { collect } = await import("../../commands/collect.js");
        await collect({
          username,
          dir: opts?.dir,
          output: opts?.output,
          evidence: opts?.evidence ?? "",
          depth: parseIntegerOption(opts?.depth ?? "3", "--depth", 0, 100),
          exclude: opts?.exclude
            ?.split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          stats: opts?.stats,
          limits,
        });
      } catch (err) {
        handleError(err);
      }
    }
  );

program
  .command("login")
  .description("Authenticate with GitHub via device flow")
  .action(async () => {
    try {
      await login();
    } catch (err) {
      handleError(err);
    }
  });

program
  .command("logout")
  .description("Remove stored GitHub credentials")
  .action(() => {
    try {
      logout();
    } catch (err) {
      handleError(err);
    }
  });

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

program
  .command("analysis-prompt")
  .description("Print portable instructions for harness-produced analysis")
  .argument("[section]", "all, knowledge, or overview", "all")
  .option(
    "--prompts <dir>",
    "Override section Markdown files; shared safeguards stay bundled"
  )
  .option(
    "--json",
    "Include prompt version, hashes, schema, and a character-based token estimate"
  )
  .option("-o, --output <file>", "Write the rendered prompt instead of stdout")
  .action(
    (
      section: string,
      opts: { prompts?: string; json?: boolean; output?: string }
    ) => {
      try {
        analysisPrompt(section, opts);
      } catch (err) {
        handleError(err);
      }
    }
  );

program
  .command("analysis-schema")
  .description("Print the JSON Schema for harness-produced analysis")
  .action(() => {
    process.stdout.write(JSON.stringify(analysisSchema, null, 2) + "\n");
  });

program
  .command("attach-analysis")
  .description(
    "Validate and add harness-produced analysis to a collected profile"
  )
  .argument("<profile>", "Collected profile JSON")
  .argument("<analysis>", "Harness analysis JSON matching analysis-schema")
  .option(
    "-o, --output <file>",
    "Write the completed profile instead of stdout"
  )
  .action((profile: string, analysis: string, opts: { output?: string }) => {
    try {
      attachAnalysis(profile, analysis, opts);
    } catch (err) {
      handleError(err);
    }
  });

program.parse();
