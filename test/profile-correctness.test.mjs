import assert from "node:assert/strict";
import test from "node:test";
import { fetchGithubData } from "../dist/github/fetcher/index.js";
import { mapRepo } from "../dist/github/fetcher/repos.js";
import { DEFAULT_LIMITS } from "../dist/limits.js";
import { runPipeline } from "../dist/pipeline.js";
import { buildLanguageStats, buildSuperlatives } from "../dist/transforms.js";

const date = new Date().toISOString();

function repository(name, pushedAt, language) {
  return {
    name,
    nameWithOwner: `Developer/${name}`,
    visibility: "PUBLIC",
    description: null,
    url: `https://github.com/Developer/${name}`,
    primaryLanguage: { name: language },
    languages: { edges: [{ size: 100, node: { name: language } }] },
    watchers: { totalCount: 0 },
    stargazerCount: 0,
    forkCount: 0,
    isFork: false,
    repositoryTopics: { nodes: [] },
    pushedAt,
    createdAt: date,
    updatedAt: date,
    diskUsage: 1,
    openIssues: { totalCount: 0 },
    defaultBranchRef: pushedAt ? { name: "main" } : null,
  };
}

test("keeps nullable push dates without ranking them as activity", () => {
  const noPush = mapRepo(repository("empty", null, "Python"));
  const pushed = mapRepo(repository("active", date, "TypeScript"));
  const stats = buildLanguageStats([noPush, pushed], new Map());
  assert.equal(
    stats.ranked.find((entry) => entry.language === "Python").lastUsed,
    undefined
  );
  assert.equal(stats.leastRecent, "TypeScript");
  assert.equal(
    buildSuperlatives([noPush, pushed], stats).mostActiveRepo,
    pushed.full_name
  );
  assert.equal(buildSuperlatives([noPush], stats).mostActiveRepo, undefined);
});

test("exports authored commits and distinguishes closed assignments from resolutions", async (t) => {
  const repos = [
    repository("empty", null, "Python"),
    repository("active", date, "TypeScript"),
  ];
  const account = { id: "author-id", login: "Developer" };
  const commit = (oid, author) => ({
    oid,
    author,
    messageHeadline: `Message from ${oid}`,
    committedDate: date,
    url: `https://github.com/Developer/active/commit/${oid}`,
  });

  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.includes("/gists?") || url.includes("/orgs?"))
      return Response.json([]);
    const { query, variables } = JSON.parse(options.body);
    if (query.includes("query FirstPage")) {
      assert.match(query, /\bid\s+login\b/);
      assert.doesNotMatch(query, /organizations\(/);
      assert.deepEqual(variables, { login: "developer" });
      return Response.json({
        data: {
          user: {
            ...account,
            repositories: { nodes: repos, totalCount: repos.length },
            followers: { totalCount: 0 },
            following: { totalCount: 0 },
            starredRepositories: { nodes: [] },
            contributionsCollection: {
              pullRequestReviewContributions: { nodes: [] },
            },
          },
        },
      });
    }
    if (query.includes("query RecentCommits")) {
      assert.match(query, /history\(first: \d+, author: \$author\)/);
      assert.deepEqual(variables, {
        owner: account.login,
        author: { id: account.id },
      });
      return Response.json({
        data: {
          r1: {
            nameWithOwner: repos[1].nameWithOwner,
            visibility: "PUBLIC",
            defaultBranchRef: {
              target: {
                history: {
                  nodes: [
                    commit("author", { name: null, user: account }),
                    commit("contributor", {
                      name: "Other Developer",
                      user: { id: "other-id", login: "other" },
                    }),
                    commit("unlinked", { name: "Developer", user: null }),
                    commit("unknown", null),
                    null,
                  ],
                },
              },
            },
          },
        },
      });
    }
    if (query.includes("query SearchData")) {
      assert.match(query, /closedAssignedIssues: search/);
      assert.match(
        variables.closedAssignedIssuesQuery,
        /assignee:Developer .*state:closed/
      );
      const own = { nameWithOwner: "DEVELOPER/active", visibility: "PUBLIC" };
      const external = { nameWithOwner: "other/project", visibility: "PUBLIC" };
      return Response.json({
        data: {
          externalPRs: {
            nodes: [
              { title: "Own PR", repository: own },
              { title: "External PR", repository: external },
            ],
          },
          issuesOpened: { nodes: [] },
          closedAssignedIssues: {
            nodes: [
              {
                title: "Closed issue assigned to the developer",
                state: "CLOSED",
                repository: external,
              },
              {
                title: "Open issue assigned to the developer",
                state: "OPEN",
                repository: external,
              },
            ],
          },
        },
      });
    }
    assert.match(query, /query ProfileReadme/);
    return Response.json({ data: { repository: null } });
  });

  const waves = await fetchGithubData("sample-token", "developer", {
    ...DEFAULT_LIMITS,
    blobRepos: 0,
    depFileRepos: 0,
  });
  const profile = await runPipeline(waves);
  assert.equal(profile.repos[0].lastCommitAt, null);
  assert.equal(profile.commitActivity.activeRepos, 1);
  assert.equal(profile.commitActivity.mostActiveRepo, repos[1].nameWithOwner);
  assert.deepEqual(
    profile.commitActivity.recentCommits.map(({ sha, author }) => [
      sha,
      author,
    ]),
    [["author", account.login]]
  );
  assert.deepEqual(
    profile.repos[1].recentCommits.map(({ sha }) => sha),
    ["author"]
  );
  assert.deepEqual(
    profile.externalPRs.map(({ title }) => title),
    ["External PR"]
  );
  assert.deepEqual(
    profile.closedAssignedIssues.map(({ title }) => title),
    ["Closed issue assigned to the developer"]
  );
  assert.deepEqual(profile.issuesResolved, []);
});
