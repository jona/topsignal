import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import { join } from "node:path";
import { after, mock, test } from "node:test";

const home = mkdtempSync(join(os.tmpdir(), "topsignal-github-privacy-"));
const homeMock = mock.method(os, "homedir", () => home);
syncBuiltinESMExports();
after(() => rmSync(home, { recursive: true, force: true }));
const { fetchGithubData } = await import("../dist/github/fetcher/index.js");
const { DEFAULT_LIMITS } = await import("../dist/limits.js");
const { runPipeline } = await import("../dist/pipeline.js");
homeMock.mock.restore();
syncBuiltinESMExports();

const date = "2026-01-01T12:00:00Z";
const publicRepo = {
  nameWithOwner: "team/public-project",
  visibility: "PUBLIC",
};
const privateRepo = {
  nameWithOwner: "team/private-project",
  visibility: "PRIVATE",
};
const internalRepo = {
  nameWithOwner: "team/internal-project",
  visibility: "INTERNAL",
};
const unknownRepo = { nameWithOwner: "team/unknown-project" };

function review(repository) {
  return { occurredAt: date, pullRequest: { repository } };
}

function stubGitHub(t, profileRepo) {
  const user = {
    id: "developer-id",
    login: "developer",
    name: "Example Developer",
    followers: { totalCount: 0 },
    following: { totalCount: 0 },
    repositories: { nodes: [], totalCount: 0 },
    starredRepositories: { nodes: [] },
    contributionsCollection: {
      totalCommitContributions: 0,
      totalPullRequestReviewContributions: 4,
      totalIssueContributions: 0,
      totalPullRequestContributions: 0,
      pullRequestReviewContributions: {
        nodes: [
          review(publicRepo),
          review(privateRepo),
          review(internalRepo),
          review(unknownRepo),
          review(null),
        ],
      },
    },
  };

  t.mock.method(globalThis, "fetch", async (url, opts) => {
    if (
      /^https:\/\/api\.github\.com\/users\/developer\/(gists|orgs)\?/.test(url)
    ) {
      return Response.json([]);
    }
    assert.equal(url, "https://api.github.com/graphql");
    const { query } = JSON.parse(opts.body);
    if (query.includes("query FirstPage")) {
      assert.match(query, /repository\s*\{\s*nameWithOwner\s+visibility\s*\}/);
      return Response.json({ data: { user } });
    }
    if (query.includes("query SearchData")) {
      return Response.json({
        data: {
          externalPRs: { nodes: [] },
          issuesOpened: { nodes: [] },
          closedAssignedIssues: { nodes: [] },
        },
      });
    }
    assert.match(query, /query ProfileReadme/);
    assert.match(query, /\{\s*visibility\s+readme:/);
    return Response.json({ data: { repository: profileRepo } });
  });
}

test("exports only public profile READMEs and review repository names", async (t) => {
  const cases = [
    ["PUBLIC", "Public profile README", "Public profile README"],
    ["PRIVATE", "Private README fixture", undefined],
    ["INTERNAL", "Internal README fixture", undefined],
    [undefined, "Unverified README fixture", undefined],
  ];
  for (const [visibility, text, expected] of cases) {
    await t.test(visibility ?? "missing visibility", async (t) => {
      stubGitHub(t, { visibility, readme: { text } });
      const waves = await fetchGithubData(
        "test-token",
        "developer",
        DEFAULT_LIMITS
      );
      const profile = await runPipeline(waves);
      assert.equal(profile.profileReadme, expected);
      assert.deepEqual(profile.codeReviews.recent, [
        { repo: publicRepo.nameWithOwner, submittedAt: date },
      ]);
    });
  }
});
