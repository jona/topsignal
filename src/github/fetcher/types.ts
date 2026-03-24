// ─── GraphQL Response Types ─────────────────────────────────────────────────

export interface GQLRepoNode {
  name: string;
  nameWithOwner: string;
  description: string | null;
  url: string;
  homepageUrl: string | null;
  primaryLanguage: { name: string } | null;
  languages: { edges: { size: number; node: { name: string } }[] };
  stargazerCount: number;
  forkCount: number;
  watchers: { totalCount: number };
  isFork: boolean;
  repositoryTopics: { nodes: { topic: { name: string } }[] };
  pushedAt: string;
  createdAt: string;
  updatedAt: string;
  diskUsage: number;
  openIssues: { totalCount: number };
  defaultBranchRef: {
    name: string;
    target?: { history?: { nodes: GQLCommitNode[] } } | null;
  } | null;
}

export interface GQLCommitNode {
  oid: string;
  messageHeadline: string;
  committedDate: string;
  url: string;
  author: { name: string; user: { login: string } | null };
}

export interface GQLStarredRepoNode {
  name: string;
  nameWithOwner: string;
  description: string | null;
  primaryLanguage: { name: string } | null;
  repositoryTopics: { nodes: { topic: { name: string } }[] };
  stargazerCount: number;
}

export interface GQLContributions {
  totalCommitContributions: number;
  totalPullRequestReviewContributions: number;
  totalIssueContributions: number;
  totalPullRequestContributions: number;
  pullRequestReviewContributions: {
    nodes: {
      occurredAt: string;
      pullRequest: {
        url: string;
        repository: { nameWithOwner: string };
      };
    }[];
  };
  contributionCalendar: {
    weeks: {
      contributionDays: { date: string; contributionCount: number }[];
    }[];
  };
}

export interface GQLPinnedItem {
  name: string;
  nameWithOwner: string;
  description: string | null;
  primaryLanguage: { name: string } | null;
  stargazerCount: number;
  repositoryTopics: { nodes: { topic: { name: string } }[] };
}

export interface GQLOrganizationNode {
  login: string;
  name: string | null;
  description: string | null;
  url: string;
  avatarUrl: string;
  membersWithRole?: { totalCount: number };
}

export interface GQLSocialAccountNode {
  provider: string;
  url: string;
  displayName: string;
}

export interface GQLContributedRepoNode {
  nameWithOwner: string;
  description: string | null;
  url: string;
  primaryLanguage: { name: string } | null;
  stargazerCount: number;
  forkCount: number;
  isInOrganization: boolean;
  owner: { login: string };
}

export interface GQLUserProfile {
  login: string;
  name: string | null;
  bio: string | null;
  location: string | null;
  company: string | null;
  websiteUrl: string | null;
  avatarUrl: string;
  url: string;
  isHireable: boolean;
  createdAt: string;
  followers: { totalCount: number };
  following: { totalCount: number };
  organizations: { nodes: GQLOrganizationNode[] };
  socialAccounts: { nodes: GQLSocialAccountNode[] };
  repositoriesContributedTo: {
    totalCount: number;
    nodes: GQLContributedRepoNode[];
  };
  repositories: {
    totalCount: number;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: GQLRepoNode[];
  };
  starredRepositories: { nodes: GQLStarredRepoNode[] };
  contributionsCollection: GQLContributions;
  pinnedItems: { nodes: GQLPinnedItem[] };
  hasSponsorsListing: boolean;
  sponsors: { totalCount: number };
  sponsoring: { totalCount: number };
}

export interface GQLSearchResult {
  nodes: GQLSearchIssueNode[];
}

export interface GQLSearchIssueNode {
  __typename?: string;
  title?: string;
  url?: string;
  state?: string;
  createdAt?: string;
  closedAt?: string | null;
  mergedAt?: string | null;
  repository?: { nameWithOwner: string };
  comments?: { totalCount: number };
  labels?: { nodes: { name: string }[] };
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  reviewDecision?: string | null;
}

export interface GQLBlobText {
  text: string | null;
}

export interface GQLDirNode {
  __typename: string;
}
