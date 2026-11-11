import { resolve, relative } from "node:path";
import { writeFileSync } from "node:fs";
import { getGhToken } from "../github/auth.js";
import { fetchGithubData } from "../github/fetcher/index.js";
import { resolveLimits, type FetchLimits } from "../limits.js";
import { runPipeline } from "../pipeline.js";
import { scanForRepos } from "../local/scanner.js";
import { canonicalDirectory } from "../local/paths.js";
import { getGitLog } from "../local/git.js";
import { mergeLocalSamples } from "../local/samples.js";
import { readDependencyFiles, readCodeBlobs } from "../local/files.js";
import { buildEvidence } from "../evidence.js";
import { sanitizeOutboundValue } from "../privacy/outbound.js";
import { computeStats } from "../stats.js";
import { renderStats } from "../ui/stats-display.js";
import { withSpinner } from "../ui/spinner.js";
import { checkEvidenceDestination, writeEvidence } from "../output.js";

export interface CollectOptions {
  dir?: string;
  username: string;
  output?: string;
  evidence: string;
  depth?: number;
  exclude?: string[];
  stats?: boolean;
  limits?: Partial<FetchLimits>;
}

export async function collect(opts: CollectOptions): Promise<void> {
  const limits = resolveLimits(opts.limits);
  if (!opts.evidence)
    throw new Error("An evidence output file is required (--evidence).");
  checkEvidenceDestination(opts.evidence, opts.output);
  const dir = opts.dir ? canonicalDirectory(resolve(opts.dir)) : undefined;
  if (opts.dir && !dir) {
    throw new Error(
      "Scan root must be a readable directory and cannot be a symlink."
    );
  }

  const scanned = dir
    ? await withSpinner(`Scanning ${dir} for git repositories`, () =>
        Promise.resolve(scanForRepos(dir, opts.depth ?? 3, opts.exclude, true))
      )
    : [];
  const localRepos = await withSpinner(
    `Reading local data from ${scanned.length} repositories`,
    () =>
      Promise.resolve(
        scanned.map(({ name, path, remote }) => ({
          name,
          remote,
          dependencyFiles: readDependencyFiles(path, dir ?? undefined),
          codeBlobs: readCodeBlobs(path, undefined, dir ?? undefined),
        }))
      )
  );
  const localEvidence = scanned.map(({ name, path, remote }) => {
    const log = getGitLog(path, 30);
    return {
      name,
      path: relative(dir!, path) || name,
      remote,
      git: {
        totalCommits: log.totalCommits,
        authors: log.authors,
        commits: log.commits,
        firstCommitDate: log.firstCommitDate,
        lastCommitDate: log.lastCommitDate,
      },
    };
  });

  const { wave1, wave2 } = await withSpinner(
    `Fetching GitHub data for ${opts.username}`,
    () => fetchGithubData(getGhToken(), opts.username, limits)
  );
  const { localRepoNames } = mergeLocalSamples(wave2, localRepos);
  const profile = sanitizeOutboundValue(await runPipeline({ wave1, wave2 }));
  const evidence = buildEvidence(
    profile.identity.username,
    profile.analyzedAt,
    wave2,
    localEvidence
  );

  // Evidence is a private harness input, never part of the published profile.
  await withSpinner(`Writing evidence to ${opts.evidence}`, () =>
    Promise.resolve(
      writeEvidence(opts.evidence, JSON.stringify(evidence, null, 2) + "\n")
    )
  );
  const json = JSON.stringify(profile, null, 2) + "\n";
  if (opts.output) {
    await withSpinner(`Writing profile to ${opts.output}`, () =>
      Promise.resolve(writeFileSync(opts.output!, json))
    );
  } else {
    process.stdout.write(json);
  }

  if (opts.stats) {
    await renderStats(
      computeStats(
        evidence.codeBlobs,
        evidence.dependencyFiles,
        localRepoNames,
        wave1.repos.map((repo) => repo.full_name)
      )
    );
  }
}
