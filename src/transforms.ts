import type {
  GithubRepo,
  GithubCommit,
  GithubGist,
  GithubStarredRepo,
  Wave1Data,
  CommitInfo,
  LanguageStats,
  LanguageRank,
  Superlatives,
  DeveloperIdentity,
} from "./types.js";

// ─── Commit mapping ─────────────────────────────────────────────────────────

export function mapCommit(c: GithubCommit): CommitInfo {
  return {
    sha: c.sha,
    message: c.commit.message.split("\n")[0].slice(0, 120),
    date: c.commit.author?.date ?? "",
    url: c.html_url,
    author: c.author?.login ?? c.commit.author?.name,
  };
}

// ─── Starred interests ──────────────────────────────────────────────────────

export function buildStarredInterests(starred: GithubStarredRepo[]) {
  const langCount: Record<string, number> = {};
  const topicCount: Record<string, number> = {};

  for (const repo of starred) {
    if (repo.language)
      langCount[repo.language] = (langCount[repo.language] ?? 0) + 1;
    for (const t of repo.topics ?? []) {
      topicCount[t] = (topicCount[t] ?? 0) + 1;
    }
  }

  const topLanguages = Object.entries(langCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([lang]) => lang);

  const topTopics = Object.entries(topicCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([topic]) => topic);

  return { topLanguages, topTopics, totalStarred: starred.length };
}

// ─── Gist mapping ───────────────────────────────────────────────────────────

export function mapGist(g: GithubGist) {
  return {
    id: g.id,
    description: g.description ?? undefined,
    url: g.html_url,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
    comments: g.comments,
    files: Object.values(g.files).map((f) => ({
      name: f.filename,
      language: f.language ?? undefined,
      size: f.size,
    })),
  };
}

// ─── Quick tech detection ───────────────────────────────────────────────────

export function detectQuick(text: string) {
  const lower = text.toLowerCase();
  const FRAMEWORKS = [
    "react",
    "vue",
    "angular",
    "django",
    "flask",
    "rails",
    "spring",
    "express",
    "next",
    "svelte",
    "fastapi",
    "gin",
    "fiber",
  ];
  const PATTERNS = [
    "microservice",
    "rest",
    "graphql",
    "event-driven",
    "mvc",
    "serverless",
    "clean-arch",
    "monorepo",
    "cqrs",
  ];
  return {
    frameworks: FRAMEWORKS.filter((f) => lower.includes(f)),
    patterns: PATTERNS.filter((p) => lower.includes(p)),
  };
}

// ─── Language stats ─────────────────────────────────────────────────────────

export function buildLanguageStats(
  repos: GithubRepo[],
  repoLanguages: Map<string, Record<string, number>>
): LanguageStats {
  const byteMap: Record<string, number> = {};
  const repoCountMap: Record<string, number> = {};
  const lastUsedMap: Record<string, string> = {};

  for (const repo of repos) {
    const langs = repoLanguages.get(repo.full_name) ?? {};
    const hasByteData = Object.keys(langs).length > 0;

    if (hasByteData) {
      for (const [lang, bytes] of Object.entries(langs)) {
        byteMap[lang] = (byteMap[lang] ?? 0) + bytes;
        repoCountMap[lang] = (repoCountMap[lang] ?? 0) + 1;
        const pushed = repo.pushed_at;
        if (!lastUsedMap[lang] || pushed > lastUsedMap[lang]) {
          lastUsedMap[lang] = pushed;
        }
      }
    } else if (repo.language) {
      const weight = repo.size > 0 ? repo.size : 1;
      byteMap[repo.language] = (byteMap[repo.language] ?? 0) + weight;
      repoCountMap[repo.language] = (repoCountMap[repo.language] ?? 0) + 1;
      const pushed = repo.pushed_at;
      if (!lastUsedMap[repo.language] || pushed > lastUsedMap[repo.language]) {
        lastUsedMap[repo.language] = pushed;
      }
    }
  }

  const totalBytes = Object.values(byteMap).reduce((a, b) => a + b, 0) || 1;
  const ranked: LanguageRank[] = Object.entries(byteMap)
    .map(([language, bytes]) => ({
      language,
      bytes,
      repoCount: repoCountMap[language] ?? 0,
      percentage: Math.round((bytes / totalBytes) * 1000) / 10,
      lastUsed: lastUsedMap[language],
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const mostUsed = ranked[0]?.language;
  const leastUsed = ranked[ranked.length - 1]?.language;
  const sortedByDate = [...ranked].sort((a, b) =>
    (b.lastUsed ?? "") > (a.lastUsed ?? "") ? 1 : -1
  );
  const mostRecent = sortedByDate[0]?.language;
  const leastRecent = sortedByDate[sortedByDate.length - 1]?.language;

  return {
    all: byteMap,
    ranked,
    mostUsed,
    leastUsed,
    mostRecent,
    leastRecent,
    primaryLanguage: mostUsed,
    topLanguages: ranked.slice(0, 10).map((r) => ({
      name: r.language,
      percentage: r.percentage,
    })),
  };
}

// ─── Superlatives ───────────────────────────────────────────────────────────

export function buildSuperlatives(
  repos: GithubRepo[],
  languageStats: LanguageStats
): Superlatives {
  return {
    mostUsedLanguage: languageStats.mostUsed,
    leastUsedLanguage: languageStats.leastUsed,
    mostRecentLanguage: languageStats.mostRecent,
    leastRecentLanguage: languageStats.leastRecent,
    mostStarredRepo: [...repos].sort(
      (a, b) => b.stargazers_count - a.stargazers_count
    )[0]?.full_name,
    mostForkedRepo: [...repos].sort((a, b) => b.forks_count - a.forks_count)[0]
      ?.full_name,
    oldestRepo: [...repos].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    )[0]?.full_name,
    newestRepo: [...repos].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    )[0]?.full_name,
    mostActiveRepo: [...repos].sort((a, b) =>
      b.pushed_at.localeCompare(a.pushed_at)
    )[0]?.full_name,
    largestRepo: [...repos].sort((a, b) => b.size - a.size)[0]?.full_name,
  };
}

// ─── Identity from Wave 1 ──────────────────────────────────────────────────

export function buildIdentityFromWave1(w1: Wave1Data): DeveloperIdentity {
  return {
    username: w1.user.login,
    name: w1.user.name ?? undefined,
    bio: w1.user.bio ?? undefined,
    location: w1.user.location ?? undefined,
    company: w1.user.company ?? undefined,
    blog: w1.user.blog ?? undefined,
    avatarUrl: w1.user.avatar_url,
    profileUrl: w1.user.html_url,
    followers: w1.user.followers,
    following: w1.user.following,
    publicRepos: w1.user.public_repos,
    publicGists: w1.user.public_gists,
    createdAt: w1.user.created_at,
    hireable: w1.user.hireable ?? undefined,
    organizations: w1.organizations,
    socialAccounts: w1.socialAccounts,
    sponsorship: w1.sponsorship,
  };
}

// ─── Repo mapping ───────────────────────────────────────────────────────────

export function mapRepo(
  r: GithubRepo,
  repoLanguageMap: Map<string, Record<string, number>>,
  repoCommitInfoMap: Map<string, CommitInfo[]>
) {
  const searchText = [r.name, r.description ?? "", ...(r.topics ?? [])].join(
    " "
  );
  const langs = repoLanguageMap.get(r.full_name) ?? {};
  const commits = repoCommitInfoMap.get(r.full_name) ?? [];
  const detectedTech = detectQuick(searchText);

  return {
    name: r.name,
    fullName: r.full_name,
    description: r.description ?? undefined,
    url: r.html_url,
    homepage: r.homepage ?? undefined,
    language: r.language ?? undefined,
    languages: langs,
    stars: r.stargazers_count,
    forks: r.forks_count,
    watchers: r.watchers_count,
    isForked: r.fork,
    isFork: r.fork,
    topics: r.topics ?? [],
    lastCommitAt: r.pushed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    size: r.size,
    openIssues: r.open_issues_count,
    defaultBranch: r.default_branch,
    recentCommits: commits,
    detectedPatterns: detectedTech.patterns,
    detectedFrameworks: detectedTech.frameworks,
  };
}

// ─── Full profile payload ───────────────────────────────────────────────────

export function buildProfilePayload(
  wave1: Wave1Data,
  wave2: {
    repoCommitMap: Map<string, GithubCommit[]>;
    profileReadme: string | null;
  },
  languageStats: LanguageStats,
  superlatives: Superlatives
) {
  const repoCommitInfoMap = new Map<string, CommitInfo[]>();
  for (const [fullName, commits] of wave2.repoCommitMap.entries()) {
    repoCommitInfoMap.set(fullName, commits.map(mapCommit));
  }

  const allCommits: CommitInfo[] = [];
  for (const commits of repoCommitInfoMap.values()) {
    allCommits.push(...commits);
  }
  allCommits.sort((a, b) => b.date.localeCompare(a.date));

  const ownRepos = wave1.repos.filter((r) => !r.fork);
  const starredInterests = buildStarredInterests(wave1.starred);
  const mappedGists = wave1.gists.map(mapGist);
  const mappedRepos = wave1.repos.map((r) =>
    mapRepo(r, wave1.repoLanguageMap, repoCommitInfoMap)
  );

  return {
    identity: buildIdentityFromWave1(wave1),
    repos: mappedRepos,
    contributedRepos: wave1.contributedRepos,
    profileReadme: wave2.profileReadme ?? undefined,
    commitActivity: {
      recentCommits: allCommits.slice(0, 30),
      totalRepos: wave1.repos.length,
      activeRepos: ownRepos.filter((r) => {
        const d = new Date(r.pushed_at);
        const sixMonths = new Date();
        sixMonths.setMonth(sixMonths.getMonth() - 6);
        return d > sixMonths;
      }).length,
      mostActiveRepo: [...ownRepos].sort((a, b) =>
        b.pushed_at.localeCompare(a.pushed_at)
      )[0]?.full_name,
    },
    externalPRs: wave1.externalPRs,
    issuesOpened: wave1.issuesOpened,
    issuesResolved: wave1.issuesResolved,
    codeReviews: wave1.codeReviews,
    contributionCounts: wave1.contributionCounts,
    gists: mappedGists,
    starredInterests,
    languageStats,
    superlatives,
    pinnedRepos: wave1.pinnedRepos,
    contributionCalendar: wave1.contributionCalendar,
    analyzedAt: new Date().toISOString(),
  };
}
