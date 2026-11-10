import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { after, mock, test } from "node:test";

const home = mkdtempSync(join(os.tmpdir(), "topsignal-github-privacy-"));
const homeMock = mock.method(os, "homedir", () => home);
syncBuiltinESMExports();
after(() => rmSync(home, { recursive: true, force: true }));
const { analyze } = await import("../dist/commands/analyze.js");
const { setPromptsDir } = await import("../dist/analyzers/prompts.js");
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
    if (url.startsWith("https://api.github.com/users/developer/gists?")) {
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
          issuesResolved: { nodes: [] },
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

test("uses the previewed prompts only after consent", async (t) => {
  stubGitHub(t, {
    visibility: "PUBLIC",
    readme: { text: "Public introduction" },
  });
  const waves = await fetchGithubData(
    "test-token",
    "developer",
    DEFAULT_LIMITS
  );
  waves.wave2.codeBlobs.push({
    repoName: "sample",
    path: "source.ts",
    language: "TypeScript",
    content: "export const example = true;",
  });

  const sent = [];
  const llm = {
    async sendMessage(prompt) {
      sent.push(prompt);
      return JSON.stringify({
        executiveSummary: "Fixture summary",
        seniorityLevel: "mid",
        seniorityReasoning: "Fixture evidence",
        roleFit: {
          primary: "Developer",
          secondary: [],
          environment: "either",
          environmentReasoning: "Fixture evidence",
        },
        strengths: [],
        concerns: [],
        interviewAngles: [],
        standoutProjects: [],
        communicationStyle: "Fixture style",
        collaborationProfile: "Fixture collaboration",
        hiringRecommendation: "Fixture recommendation",
      });
    },
  };
  const result = await runPipeline({
    ...waves,
    llm,
    confirm: async () => false,
  });
  assert.equal(result, null);
  assert.deepEqual(sent, []);

  let previewed;
  const approved = await runPipeline({
    ...waves,
    llm,
    confirm: async (prompts) => {
      assert.deepEqual(sent, []);
      previewed = prompts;
      return true;
    },
  });
  assert.deepEqual(sent, [previewed.knowledge, previewed.overview]);
  assert.equal(approved.analysis.overview.executiveSummary, "Fixture summary");
});

test("analyze previews the overview and declines when stdin closes", async (t) => {
  const prompts = mkdtempSync(join(home, "consent-"));
  writeFileSync(join(prompts, "overview.md"), "Profile preview: {{profile}}");
  t.after(() => {
    setPromptsDir(undefined);
    rmSync(prompts, { recursive: true, force: true });
  });

  const env = {
    GITHUB_TOKEN: "test-github-token",
    OPENAI_API_KEY: "test-openai-key",
  };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }

  stubGitHub(t, {
    visibility: "PUBLIC",
    readme: { text: "Public introduction" },
  });
  const fetchMock = globalThis.fetch.mock;
  const stdin = Readable.from(["v\n"]);
  t.mock.getter(process, "stdin", () => stdin);
  const messages = [];
  t.mock.method(process.stderr, "write", (data) => {
    messages.push(String(data));
    return true;
  });
  const output = join(home, "profile.json");

  await analyze({ username: "developer", provider: "openai", prompts, output });
  assert.match(messages.join(""), /Profile preview: .*"identity"/s);
  assert.match(messages.join(""), /Aborted by user/);
  assert.equal(existsSync(output), false);
  assert.ok(
    fetchMock.calls.every(
      ({ arguments: [url] }) => new URL(url).hostname === "api.github.com"
    )
  );
});
