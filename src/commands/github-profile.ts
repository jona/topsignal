import { getGhToken, getGhUsername } from "../github/auth.js";
import { fetchGithubData } from "../github/fetcher/index.js";
import { resolveLimits } from "../limits.js";
import {
  buildLanguageStats,
  buildSuperlatives,
  buildProfilePayload,
} from "../transforms.js";
import { withSpinner } from "../ui/spinner.js";

export interface GithubProfileOptions {
  username?: string;
}

export async function githubProfile(opts: GithubProfileOptions) {
  const token = getGhToken();
  const username = opts.username ?? (await getGhUsername(token));

  const { wave1, wave2 } = await withSpinner(
    `Fetching profile for ${username}`,
    () => fetchGithubData(token, username, resolveLimits())
  );

  const ownRepos = wave1.repos.filter((r) => !r.fork);
  const languageStats = buildLanguageStats(wave1.repos, wave1.repoLanguageMap);
  const superlatives = buildSuperlatives(ownRepos, languageStats);

  const profile = buildProfilePayload(
    wave1,
    wave2,
    languageStats,
    superlatives
  );

  // Output JSON to stdout (progress messages go to stderr)
  process.stdout.write(JSON.stringify(profile, null, 2) + "\n");
}
