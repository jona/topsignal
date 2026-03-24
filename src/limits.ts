import { existsSync, readFileSync } from "node:fs";
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

function loadConfigFile(): Partial<FetchLimits> {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<FetchLimits>;
  } catch {
    return {};
  }
}

// ─── Env override ─────────────────────────────────────────────────────────────

function fromEnv(): Partial<FetchLimits> {
  const result: Partial<FetchLimits> = {};
  for (const [key, envVar] of Object.entries(ENV_MAP) as [
    keyof FetchLimits,
    string,
  ][]) {
    const val = process.env[envVar];
    if (val !== undefined) {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n > 0) result[key] = n;
    }
  }
  return result;
}

// ─── Resolver — flags > env > config file > defaults ─────────────────────────

export function resolveLimits(flags: Partial<FetchLimits> = {}): FetchLimits {
  const file = loadConfigFile();
  const env = fromEnv();
  const cleanFlags = Object.fromEntries(
    Object.entries(flags).filter(([, v]) => v !== undefined)
  ) as Partial<FetchLimits>;
  return { ...DEFAULT_LIMITS, ...file, ...env, ...cleanFlags };
}
