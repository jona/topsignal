import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface FetchLimits {
  /** repositories(first: N) in GraphQL */
  repos: number;
  /** starredRepositories(first: N) */
  starred: number;
  /** organizations(first: N) */
  orgs: number;
  /** repositoriesContributedTo(first: N) */
  contributedRepos: number;
  /** pullRequestReviewContributions(first: N) */
  prReviews: number;
  /** search external PRs — first: N */
  externalPrs: number;
  /** search issues opened/resolved — first: N each */
  issues: number;
  /** REST gists per_page */
  gists: number;
  /** repos to fetch dependency files from (slice of non-fork repos) */
  depFileRepos: number;
  /** repos to fetch recent commits from (slice of non-fork repos) */
  commitRepos: number;
  /** commits fetched per repo */
  commitsPerRepo: number;
  /** repos to sample code blobs from (slice of non-fork repos by size) */
  blobRepos: number;
  /** code files fetched per blob repo */
  filesPerBlobRepo: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_LIMITS: FetchLimits = {
  repos: 50,
  starred: 50,
  orgs: 20,
  contributedRepos: 30,
  prReviews: 20,
  externalPrs: 30,
  issues: 30,
  gists: 30,
  depFileRepos: 10,
  commitRepos: 6,
  commitsPerRepo: 10,
  blobRepos: 5,
  filesPerBlobRepo: 3,
};

// ─── Env var names ────────────────────────────────────────────────────────────

const ENV_MAP: Record<keyof FetchLimits, string> = {
  repos: "TOPSIGNAL_REPOS",
  starred: "TOPSIGNAL_STARRED",
  orgs: "TOPSIGNAL_ORGS",
  contributedRepos: "TOPSIGNAL_CONTRIBUTED_REPOS",
  prReviews: "TOPSIGNAL_PR_REVIEWS",
  externalPrs: "TOPSIGNAL_EXTERNAL_PRS",
  issues: "TOPSIGNAL_ISSUES",
  gists: "TOPSIGNAL_GISTS",
  depFileRepos: "TOPSIGNAL_DEP_FILE_REPOS",
  commitRepos: "TOPSIGNAL_COMMIT_REPOS",
  commitsPerRepo: "TOPSIGNAL_COMMITS_PER_REPO",
  blobRepos: "TOPSIGNAL_BLOB_REPOS",
  filesPerBlobRepo: "TOPSIGNAL_FILES_PER_BLOB_REPO",
};

// ─── Config file ──────────────────────────────────────────────────────────────

export const CONFIG_PATH = join(homedir(), ".topsignal", "config.json");

function loadConfigFile(): Record<string, unknown> {
  try {
    const config: unknown = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    if (
      config === null ||
      typeof config !== "object" ||
      Array.isArray(config)
    ) {
      throw new Error("Expected a JSON object");
    }
    return config as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error("Invalid TopSignal fetch limits configuration", {
      cause: error,
    });
  }
}

export function parseIntegerOption(
  value: unknown,
  name: string,
  min: number,
  max: number
): number {
  const number =
    typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : value;
  if (
    typeof number !== "number" ||
    !Number.isSafeInteger(number) ||
    number < min ||
    number > max
  ) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return number;
}

const ZERO_ALLOWED = new Set<keyof FetchLimits>([
  "depFileRepos",
  "commitRepos",
  "blobRepos",
  "filesPerBlobRepo",
]);

// Flags take precedence over environment variables, config, and defaults.
export function resolveLimits(flags: Partial<FetchLimits> = {}): FetchLimits {
  const file = loadConfigFile();
  const result = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(DEFAULT_LIMITS) as (keyof FetchLimits)[]) {
    const envVar = ENV_MAP[key];
    const flag = flags[key];
    const env = process.env[envVar];
    const min = ZERO_ALLOWED.has(key) ? 0 : 1;
    if (flag !== undefined) {
      result[key] = parseIntegerOption(flag, key, min, 100);
    } else if (env !== undefined) {
      result[key] = parseIntegerOption(env, envVar, min, 100);
    } else if (Object.hasOwn(file, key)) {
      const value = file[key];
      result[key] = parseIntegerOption(
        typeof value === "number" ? value : NaN,
        `config.json: ${key}`,
        min,
        100
      );
    }
  }
  return result;
}
