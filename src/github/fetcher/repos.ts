import { githubGraphQL } from "../graphql.js";
import type { GithubRepo, GithubCommit } from "../../types.js";
import type { GQLRepoNode, GQLCommitNode } from "./types.js";

export function mapRepo(r: GQLRepoNode): GithubRepo {
  return {
    name: r.name,
    full_name: r.nameWithOwner,
    description: r.description,
    html_url: r.url,
    homepage: r.homepageUrl,
    language: r.primaryLanguage?.name ?? null,
    stargazers_count: r.stargazerCount,
    forks_count: r.forkCount,
    watchers_count: r.watchers.totalCount,
    fork: r.isFork,
    topics: r.repositoryTopics.nodes.map((t) => t.topic.name),
    pushed_at: r.pushedAt,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    size: r.diskUsage,
    open_issues_count: r.openIssues.totalCount,
    default_branch: r.defaultBranchRef?.name ?? "main",
    owner: { login: r.nameWithOwner.split("/")[0] },
  };
}

export function mapCommitGQL(c: GQLCommitNode): GithubCommit {
  return {
    sha: c.oid,
    commit: {
      message: c.messageHeadline,
      author: { name: c.author.name, date: c.committedDate },
    },
    html_url: c.url,
    author: c.author.user ? { login: c.author.user.login } : null,
  };
}

export function buildLanguageMap(r: GQLRepoNode): Record<string, number> {
  const map: Record<string, number> = {};
  for (const edge of r.languages.edges) {
    map[edge.node.name] = edge.size;
  }
  return map;
}

export async function fetchRecentCommits(
  token: string,
  username: string,
  repos: GithubRepo[],
  repoLimit: number,
  commitsPerRepo: number
): Promise<Map<string, GithubCommit[]>> {
  const targets = repos.filter((r) => !r.fork).slice(0, repoLimit);
  if (targets.length === 0) return new Map();

  const fragments = targets
    .map((r, i) => {
      const safeName = r.name.replace(/[^a-zA-Z0-9_.-]/g, "");
      return `r${i}: repository(owner: "${username}", name: "${safeName}") {
      nameWithOwner
      defaultBranchRef {
        target {
          ... on Commit {
            history(first: ${commitsPerRepo}) {
              nodes { oid messageHeadline committedDate url author { name user { login } } }
            }
          }
        }
      }
    }`;
    })
    .join("\n");

  const query = `query RecentCommits {\n${fragments}\n}`;

  type CommitResult = Record<
    string,
    {
      nameWithOwner: string;
      defaultBranchRef: {
        target: { history: { nodes: GQLCommitNode[] } } | null;
      } | null;
    }
  >;

  const data = await githubGraphQL<CommitResult>(token, query, {});
  const map = new Map<string, GithubCommit[]>();
  for (const key of Object.keys(data)) {
    const repo = data[key];
    if (!repo) continue;
    const commits = repo.defaultBranchRef?.target?.history?.nodes ?? [];
    if (commits.length > 0) {
      map.set(repo.nameWithOwner, commits.map(mapCommitGQL));
    }
  }
  return map;
}
