import type { FetchLimits } from "../../limits.js";
import type { MappedIssue } from "../../types.js";
import type { GQLSearchIssueNode } from "./types.js";

export function buildSearchQuery(l: FetchLimits): string {
  return `
query SearchData($prQuery: String!, $issuesOpenedQuery: String!, $closedAssignedIssuesQuery: String!) {
  externalPRs: search(query: $prQuery, type: ISSUE, first: ${l.externalPrs}) {
    nodes {
      ... on PullRequest {
        title url state createdAt closedAt mergedAt
        additions deletions changedFiles reviewDecision
        repository { nameWithOwner visibility }
        comments { totalCount }
        labels(first: 5) { nodes { name } }
      }
    }
  }
  issuesOpened: search(query: $issuesOpenedQuery, type: ISSUE, first: ${l.issues}) {
    nodes {
      ... on Issue {
        title url state createdAt closedAt
        repository { nameWithOwner visibility }
        comments { totalCount }
        labels(first: 5) { nodes { name } }
      }
    }
  }
  closedAssignedIssues: search(query: $closedAssignedIssuesQuery, type: ISSUE, first: ${l.issues}) {
    nodes {
      ... on Issue {
        title url state createdAt closedAt
        repository { nameWithOwner visibility }
        labels(first: 5) { nodes { name } }
      }
    }
  }
}
`;
}

export function mapSearchIssue(item: GQLSearchIssueNode): MappedIssue {
  return {
    title: item.title ?? "",
    url: item.url ?? "",
    repo: item.repository?.nameWithOwner ?? "",
    state: (item.state ?? "").toLowerCase(),
    createdAt: item.createdAt ?? "",
    closedAt: item.closedAt ?? undefined,
    comments: item.comments?.totalCount ?? 0,
    labels: item.labels?.nodes.map((l) => l.name) ?? [],
    merged: item.mergedAt != null,
    additions: item.additions,
    deletions: item.deletions,
    changedFiles: item.changedFiles,
    reviewDecision: item.reviewDecision ?? undefined,
  };
}
