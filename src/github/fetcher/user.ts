import type { FetchLimits } from "../../limits.js";
import type { GithubStarredRepo } from "../../types.js";
import type { GQLStarredRepoNode } from "./types.js";

export function buildFirstPageQuery(l: FetchLimits): string {
  return `
query FirstPage($login: String!) {
  user(login: $login) {
    login name bio location company
    websiteUrl avatarUrl url isHireable createdAt
    followers { totalCount }
    following { totalCount }
    organizations(first: ${l.orgs}) {
      nodes { login name description url avatarUrl }
    }
    socialAccounts(first: 10) {
      nodes { provider url displayName }
    }
    repositoriesContributedTo(
      first: ${l.contributedRepos}
      contributionTypes: [COMMIT, PULL_REQUEST, PULL_REQUEST_REVIEW]
      privacy: PUBLIC
      includeUserRepositories: false
      orderBy: { field: STARGAZERS, direction: DESC }
    ) {
      totalCount
      nodes {
        nameWithOwner description url
        primaryLanguage { name }
        stargazerCount forkCount
        isInOrganization
        owner { login }
      }
    }
    hasSponsorsListing
    sponsors(first: 0) { totalCount }
    sponsoring(first: 0) { totalCount }
    repositories(
      first: ${l.repos}
      privacy: PUBLIC
      ownerAffiliations: OWNER
      orderBy: { field: PUSHED_AT, direction: DESC }
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        name nameWithOwner description url homepageUrl
        primaryLanguage { name }
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name } }
        }
        stargazerCount forkCount
        watchers { totalCount }
        isFork
        repositoryTopics(first: 10) { nodes { topic { name } } }
        pushedAt createdAt updatedAt diskUsage
        openIssues: issues(states: OPEN) { totalCount }
        defaultBranchRef { name }
      }
    }
    starredRepositories(first: ${l.starred}, orderBy: { field: STARRED_AT, direction: DESC }) {
      nodes {
        name nameWithOwner description
        primaryLanguage { name }
        repositoryTopics(first: 5) { nodes { topic { name } } }
        stargazerCount
      }
    }
    pinnedItems(first: 6, types: REPOSITORY) {
      nodes {
        ... on Repository {
          name nameWithOwner description
          primaryLanguage { name }
          stargazerCount
          repositoryTopics(first: 5) { nodes { topic { name } } }
        }
      }
    }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestReviewContributions
      totalIssueContributions
      totalPullRequestContributions
      pullRequestReviewContributions(first: ${l.prReviews}) {
        nodes {
          occurredAt
          pullRequest {
            url
            repository { nameWithOwner }
          }
        }
      }
      contributionCalendar {
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}
`;
}

export function mapStarred(r: GQLStarredRepoNode): GithubStarredRepo {
  return {
    name: r.name,
    full_name: r.nameWithOwner,
    description: r.description,
    language: r.primaryLanguage?.name ?? null,
    topics: r.repositoryTopics.nodes.map((t) => t.topic.name),
    stargazers_count: r.stargazerCount,
  };
}
