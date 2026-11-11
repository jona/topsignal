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
import {
  buildFirstPageQuery,
  mapStarred,
  fetchPublicOrganizations,
} from "./user.js";
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
  const firstPage = await githubGraphQL<{ user: GQLUserProfile }>(
    token,
    buildFirstPageQuery(limits),
    { login: username }
  );

  const gqlUser = firstPage.user;
  const login = gqlUser.login;
  const ownedRepoPrefix = `${login.toLowerCase()}/`;
  const allGQLRepos = gqlUser.repositories.nodes.filter(
    (repo) => repo?.visibility === "PUBLIC"
  );
  const repos = allGQLRepos.map(mapRepo);
  const ownRepos = repos.filter((r) => !r.fork);

  const [
    searchData,
    gists,
    dependencyFiles,
    repoCommitMap,
    profileReadme,
    codeBlobs,
    organizations,
  ] = await Promise.all([
    githubGraphQL<{
      externalPRs: GQLSearchResult;
      issuesOpened: GQLSearchResult;
      closedAssignedIssues: GQLSearchResult;
    }>(token, buildSearchQuery(limits), {
      prQuery: `author:${login} type:pr is:public`,
      issuesOpenedQuery: `author:${login} type:issue is:public`,
      closedAssignedIssuesQuery: `assignee:${login} type:issue state:closed is:public`,
    }),
    fetchGistsREST(token, login, limits.gists),
    fetchDependencyFiles(token, login, repos, limits.depFileRepos),
    fetchRecentCommits(
      token,
      gqlUser,
      repos,
      limits.commitRepos,
      limits.commitsPerRepo
    ),
    fetchProfileReadme(token, login),
    fetchCodeBlobs(
      token,
      login,
      ownRepos,
      limits.blobRepos,
      limits.filesPerBlobRepo
    ),
    fetchPublicOrganizations(token, login, limits.orgs),
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
      (n) =>
        n?.title &&
        n.repository?.visibility === "PUBLIC" &&
        !n.repository.nameWithOwner.toLowerCase().startsWith(ownedRepoPrefix)
    )
    .map(mapSearchIssue);

  const issuesOpened = searchData.issuesOpened.nodes
    .filter((n) => n?.title && n.repository?.visibility === "PUBLIC")
    .map(mapSearchIssue);

  const closedAssignedIssues = (searchData.closedAssignedIssues?.nodes ?? [])
    .filter(
      (n) =>
        n?.title &&
        n.state === "CLOSED" &&
        n.repository?.visibility === "PUBLIC"
    )
    .map(mapSearchIssue);

  const pinnedRepos = (gqlUser.pinnedItems?.nodes ?? [])
    .filter((repo) => repo?.visibility === "PUBLIC")
    .map((p) => ({
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
    recent: contrib.pullRequestReviewContributions.nodes.flatMap((review) => {
      const repo = review?.pullRequest?.repository;
      if (repo?.visibility !== "PUBLIC") return [];
      return [{ repo: repo.nameWithOwner, submittedAt: review.occurredAt }];
    }),
  };

  const contributionCounts = {
    totalCommits: contrib.totalCommitContributions,
    totalPRReviews: contrib.totalPullRequestReviewContributions,
    totalIssues: contrib.totalIssueContributions,
    totalPRs: contrib.totalPullRequestContributions,
  };

  const socialAccounts: GithubSocialAccount[] = (
    gqlUser.socialAccounts?.nodes ?? []
  ).map((s) => ({
    provider: s.provider,
    url: s.url,
    displayName: s.displayName,
  }));

  const contributedRepos: GithubContributedRepo[] = (
    gqlUser.repositoriesContributedTo?.nodes ?? []
  )
    .filter((repo) => repo?.visibility === "PUBLIC")
    .map((r) => ({
      fullName: r.nameWithOwner,
      description: r.description,
      url: r.url,
      language: r.primaryLanguage?.name ?? null,
      stars: r.stargazerCount,
      forks: r.forkCount,
      isOrg: r.isInOrganization,
      owner: r.nameWithOwner.split("/")[0],
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
    starred: gqlUser.starredRepositories.nodes
      .filter((repo) => repo?.visibility === "PUBLIC")
      .map(mapStarred),
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
    closedAssignedIssues,
  };

  const wave2: Wave2Data = {
    repoCommitMap,
    profileReadme,
    dependencyFiles,
    codeBlobs,
  };

  return { wave1, wave2 };
}
