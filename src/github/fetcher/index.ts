import { githubGraphQL } from "../graphql.js";
import type { FetchLimits } from "../../limits.js";
import type {
  GithubUser,
  GithubOrganization,
  GithubSocialAccount,
  GithubContributedRepo,
  Wave1Data,
  Wave2Data,
} from "../../types.js";
import type { GQLUserProfile, GQLSearchResult } from "./types.js";
import { buildFirstPageQuery, mapStarred } from "./user.js";
import { mapRepo, buildLanguageMap, fetchRecentCommits } from "./repos.js";
import { buildSearchQuery, mapSearchIssue } from "./search.js";
import { fetchGistsREST } from "./gists.js";
import { fetchProfileReadme } from "./readme.js";
import { fetchDependencyFiles } from "./deps.js";
import { fetchCodeBlobs } from "./blobs.js";

export async function fetchGithubData(
  token: string,
  username: string,
  limits: FetchLimits
): Promise<{ wave1: Wave1Data; wave2: Wave2Data }> {
  // Fire search + gists immediately — don't await yet
  const searchPromise = githubGraphQL<{
    externalPRs: GQLSearchResult;
    issuesOpened: GQLSearchResult;
    issuesResolved: GQLSearchResult;
  }>(token, buildSearchQuery(limits), {
    prQuery: `author:${username} type:pr is:public`,
    issuesOpenedQuery: `author:${username} type:issue is:public`,
    issuesResolvedQuery: `assignee:${username} type:issue state:closed is:public`,
  });
  // Prevent unhandled rejection if firstPage throws before Promise.all is reached
  searchPromise.catch(() => {});
  const gistsPromise = fetchGistsREST(token, username, limits.gists);
  gistsPromise.catch(() => {});

  // Await first page to get repos, then immediately kick off wave2 work
  const firstPage = await githubGraphQL<{ user: GQLUserProfile }>(
    token,
    buildFirstPageQuery(limits),
    { login: username }
  );

  const gqlUser = firstPage.user;
  const allGQLRepos = gqlUser.repositories.nodes;
  const repos = allGQLRepos.map(mapRepo);
  const ownRepos = repos.filter((r) => !r.fork);

  // Wave2 starts here — search+gists may still be running
  const [
    searchData,
    gists,
    dependencyFiles,
    repoCommitMap,
    profileReadme,
    codeBlobs,
  ] = await Promise.all([
    searchPromise,
    gistsPromise,
    fetchDependencyFiles(token, username, repos, limits.depFileRepos),
    fetchRecentCommits(
      token,
      username,
      repos,
      limits.commitRepos,
      limits.commitsPerRepo
    ),
    fetchProfileReadme(token, username),
    fetchCodeBlobs(
      token,
      username,
      ownRepos,
      limits.blobRepos,
      limits.filesPerBlobRepo
    ),
  ]);

  // ── Build wave1 ──────────────────────────────────────────────────────────

  const repoLanguageMap = new Map<string, Record<string, number>>();
  for (const r of allGQLRepos) {
    const langs = buildLanguageMap(r);
    if (Object.keys(langs).length > 0) {
      repoLanguageMap.set(r.nameWithOwner, langs);
    }
  }

  const user: GithubUser = {
    login: gqlUser.login,
    name: gqlUser.name,
    bio: gqlUser.bio,
    location: gqlUser.location,
    company: gqlUser.company,
    blog: gqlUser.websiteUrl,
    avatar_url: gqlUser.avatarUrl,
    html_url: gqlUser.url,
    followers: gqlUser.followers.totalCount,
    following: gqlUser.following.totalCount,
    public_repos: gqlUser.repositories.totalCount,
    public_gists: gists.length,
    created_at: gqlUser.createdAt,
    hireable: gqlUser.isHireable,
  };

  const contrib = gqlUser.contributionsCollection;

  const externalPRs = searchData.externalPRs.nodes
    .filter(
      (n) => n.title && !n.repository?.nameWithOwner.startsWith(`${username}/`)
    )
    .map(mapSearchIssue);

  const issuesOpened = searchData.issuesOpened.nodes
    .filter((n) => n.title)
    .map(mapSearchIssue);

  const issuesResolved = searchData.issuesResolved.nodes
    .filter((n) => n.title)
    .map(mapSearchIssue);

  const pinnedRepos = (gqlUser.pinnedItems?.nodes ?? []).map((p) => ({
    name: p.name,
    fullName: p.nameWithOwner,
    description: p.description,
    language: p.primaryLanguage?.name ?? null,
    stars: p.stargazerCount,
    topics: p.repositoryTopics.nodes.map((t) => t.topic.name),
  }));

  const contributionCalendar = {
    weeks: (contrib.contributionCalendar?.weeks ?? []).map((w) => ({
      days: w.contributionDays.map((d) => ({
        date: d.date,
        count: d.contributionCount,
      })),
    })),
  };

  const codeReviews = {
    count: contrib.totalPullRequestReviewContributions,
    recent: contrib.pullRequestReviewContributions.nodes.map((n) => ({
      repo: n.pullRequest.repository.nameWithOwner,
      submittedAt: n.occurredAt,
    })),
  };

  const contributionCounts = {
    totalCommits: contrib.totalCommitContributions,
    totalPRReviews: contrib.totalPullRequestReviewContributions,
    totalIssues: contrib.totalIssueContributions,
    totalPRs: contrib.totalPullRequestContributions,
  };

  const organizations: GithubOrganization[] = (
    gqlUser.organizations?.nodes ?? []
  ).map((o) => ({
    login: o.login,
    name: o.name,
    description: o.description,
    url: o.url,
    avatarUrl: o.avatarUrl,
    memberCount: o.membersWithRole?.totalCount ?? 0,
  }));

  const socialAccounts: GithubSocialAccount[] = (
    gqlUser.socialAccounts?.nodes ?? []
  ).map((s) => ({
    provider: s.provider,
    url: s.url,
    displayName: s.displayName,
  }));

  const contributedRepos: GithubContributedRepo[] = (
    gqlUser.repositoriesContributedTo?.nodes ?? []
  ).map((r) => ({
    fullName: r.nameWithOwner,
    description: r.description,
    url: r.url,
    language: r.primaryLanguage?.name ?? null,
    stars: r.stargazerCount,
    forks: r.forkCount,
    isOrg: r.isInOrganization,
    owner: r.owner.login,
  }));

  const sponsorship = {
    hasListing: gqlUser.hasSponsorsListing ?? false,
    sponsorCount: gqlUser.sponsors?.totalCount ?? 0,
    sponsoringCount: gqlUser.sponsoring?.totalCount ?? 0,
  };

  const wave1: Wave1Data = {
    user,
    repos,
    repoLanguageMap,
    gists,
    starred: gqlUser.starredRepositories.nodes.map(mapStarred),
    organizations,
    socialAccounts,
    contributedRepos,
    sponsorship,
    pinnedRepos,
    contributionCalendar,
    contributionCounts,
    codeReviews,
    externalPRs,
    issuesOpened,
    issuesResolved,
  };

  const wave2: Wave2Data = {
    repoCommitMap,
    profileReadme,
    dependencyFiles,
    codeBlobs,
  };

  return { wave1, wave2 };
}
