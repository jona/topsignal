import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const cli = fileURLToPath(
  new URL("../dist/entrypoints/cli/index.js", import.meta.url)
);
const timestamp = "2026-01-02T12:00:00.000Z";
const executableEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    /^(PATH|PATHEXT|SystemRoot|windir)$/i.test(key)
  )
);

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "topsignal-harness-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const requests = join(root, "requests.jsonl");
  const setup = join(root, "setup.mjs");
  writeFileSync(
    setup,
    `import os from "node:os";
import { appendFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
os.homedir = () => ${JSON.stringify(root)};
syncBuiltinESMExports();
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const address = String(url);
  // Ink loads its bundled Yoga WebAssembly through a data URL, without I/O.
  if (address.startsWith("data:")) return nativeFetch(url, options);
  appendFileSync(${JSON.stringify(requests)}, JSON.stringify(address) + "\\n");
  if (/^https:\\/\\/api\\.github\\.com\\/users\\/developer\\/(gists|orgs)\\?/.test(address)) {
    return Response.json([]);
  }
  if (address !== "https://api.github.com/graphql") {
    throw new Error("Unexpected network request: " + address);
  }
  const { query } = JSON.parse(options.body);
  if (query.includes("query FirstPage")) {
    return Response.json({ data: { user: {
      id: "developer-id", login: "developer", name: "Example Developer",
      bio: null, location: null, company: null, websiteUrl: null,
      avatarUrl: "https://avatars.githubusercontent.com/u/12345",
      url: "https://github.com/developer", isHireable: null,
      createdAt: ${JSON.stringify(timestamp)},
      followers: { totalCount: 0 }, following: { totalCount: 0 },
      repositories: { nodes: [], totalCount: 0 },
      starredRepositories: { nodes: [] },
      contributionsCollection: {
        totalCommitContributions: 0, totalPullRequestReviewContributions: 0,
        totalIssueContributions: 0, totalPullRequestContributions: 0,
        pullRequestReviewContributions: { nodes: [] },
        contributionCalendar: { weeks: [] },
      },
    } } });
  }
  if (query.includes("query SearchData")) {
    return Response.json({ data: {
      externalPRs: { nodes: [] }, issuesOpened: { nodes: [] },
      closedAssignedIssues: { nodes: [] },
    } });
  }
  if (query.includes("query ProfileReadme")) {
    return Response.json({ data: { repository: null } });
  }
  throw new Error("Unexpected GitHub query");
};
`
  );

  const env = {
    ...executableEnv,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(root, "gitconfig"),
  };
  function node(args, overrides = {}) {
    return spawnSync(
      process.execPath,
      ["--import", pathToFileURL(setup).href, ...args],
      {
        cwd: root,
        env: { ...env, ...overrides },
        encoding: "utf8",
        timeout: 20_000,
      }
    );
  }
  return { root, requests, env, node };
}

function profileFixture() {
  return {
    identity: {
      username: "developer",
      name: "Example Developer",
      avatarUrl: "https://avatars.githubusercontent.com/u/12345",
      profileUrl: "https://github.com/developer",
      followers: 5,
      following: 4,
      publicRepos: 0,
      publicGists: 0,
      createdAt: timestamp,
      organizations: [],
      socialAccounts: [],
      sponsorship: { hasListing: false, sponsorCount: 0, sponsoringCount: 0 },
    },
    repos: [],
    contributedRepos: [],
    commitActivity: { recentCommits: [], totalRepos: 0, activeRepos: 0 },
    externalPRs: [],
    issuesOpened: [],
    closedAssignedIssues: [],
    issuesResolved: [],
    codeReviews: { count: 0, recent: [] },
    contributionCounts: {
      totalCommits: 1,
      totalPRReviews: 0,
      totalIssues: 0,
      totalPRs: 0,
    },
    gists: [],
    starredInterests: { topLanguages: [], topTopics: [], totalStarred: 0 },
    languageStats: { all: {}, ranked: [], topLanguages: [] },
    superlatives: {},
    pinnedRepos: [],
    contributionCalendar: { weeks: [] },
    analyzedAt: timestamp,
  };
}

function analysisFixture() {
  return {
    knowledge: {
      techStack: [
        {
          name: "TypeScript",
          category: "language",
          repoExamples: ["developer/harness-demo"],
        },
      ],
      csFundamentals: [],
      architecturePatterns: [],
      testingPractices: [],
      systemThinking: [],
      devOps: [],
      security: [],
      apiDesign: [
        {
          name: "JSON CLI interface",
          evidence: ["src/index.ts writes a structured JSON result."],
          confidence: "high",
          repoExamples: ["developer/harness-demo"],
        },
      ],
      documentation: [],
      performance: [],
      openSourceCitizenship: [],
    },
    overview: {
      executiveSummary: "Builds developer tools in TypeScript.",
      seniorityLevel: "mid",
      seniorityReasoning: "The sampled project has a focused CLI interface.",
      roleFit: {
        primary: "Developer Tools Engineer",
        secondary: [],
        environment: "either",
        environmentReasoning: "The public sample is small and focused.",
      },
      strengths: [{ title: "CLI design", evidence: "Structured JSON output." }],
      concerns: [],
      interviewAngles: ["How do you version the JSON interface?"],
      standoutProjects: [
        {
          name: "harness-demo",
          url: "https://github.com/developer/harness-demo",
          why: "Clear CLI interface.",
        },
      ],
      communicationStyle: "Concise documentation.",
      collaborationProfile: "The sample does not establish team experience.",
      hiringRecommendation: "Discuss the design of the sample project.",
    },
  };
}

test("collect writes private local evidence separately and never contacts an LLM", (t) => {
  const { root, requests, env, node } = fixture(t);
  const code = join(root, "code");
  const repo = join(code, "project");
  mkdirSync(repo, { recursive: true });
  const gitEnv = {
    ...env,
    GIT_AUTHOR_NAME: "Harness Author",
    GIT_AUTHOR_EMAIL: "author@example.test",
    GIT_COMMITTER_NAME: "Harness Author",
    GIT_COMMITTER_EMAIL: "author@example.test",
    GIT_AUTHOR_DATE: timestamp,
    GIT_COMMITTER_DATE: timestamp,
  };
  function git(args) {
    return execFileSync("git", args, {
      cwd: repo,
      env: gitEnv,
      input: "",
      encoding: "utf8",
      stdio: "pipe",
    });
  }
  git(["init", "--quiet", "--initial-branch=main"]);
  git([
    "remote",
    "add",
    "origin",
    "https://github.com/developer/harness-demo.git",
  ]);
  writeFileSync(
    join(repo, "engine.ts"),
    'export const harnessLocalEvidence = "local-code-fixture";\n' +
      "export function buildStructuredOutput(value: string) { return JSON.stringify({ value, collected: true }); }\n"
  );
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify({ name: "harness-demo", type: "module" })
  );
  git(["add", "engine.ts", "package.json"]);
  git(["commit", "--quiet", "--no-gpg-sign", "-m", "Add structured CLI"]);
  writeFileSync(
    join(repo, "untracked.ts"),
    'const privateFixture = "untracked";'
  );

  const profileFile = join(root, "profile.json");
  const evidenceFile = join(root, "evidence.json");
  const result = node(
    [
      cli,
      "collect",
      "developer",
      "--dir",
      code,
      "--output",
      profileFile,
      "--evidence",
      evidenceFile,
    ],
    {
      GITHUB_TOKEN: "fixture-github-token",
      OPENAI_API_KEY: "unused-openai-fixture-key",
      ANTHROPIC_API_KEY: "unused-anthropic-fixture-key",
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  const profileText = readFileSync(profileFile, "utf8");
  const evidenceText = readFileSync(evidenceFile, "utf8");
  const profile = JSON.parse(profileText);
  const evidence = JSON.parse(evidenceText);
  assert.equal(profile.identity.username, "developer");
  for (const key of [
    "analysis",
    "evidence",
    "localRepos",
    "codeBlobs",
    "dependencyFiles",
  ]) {
    assert.equal(Object.hasOwn(profile, key), false, key);
  }
  assert.doesNotMatch(profileText, /local-code-fixture|harnessLocalEvidence/);
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.username, "developer");
  assert.ok(Number.isFinite(Date.parse(evidence.collectedAt)));
  assert.equal(evidence.localRepos.length, 1);
  assert.equal(evidence.localRepos[0].name, "project");
  assert.equal(evidence.localRepos[0].path, "project");
  assert.equal(evidence.localRepos[0].git.totalCommits, 1);
  assert.deepEqual(evidence.localRepos[0].git.authors, [
    { name: "Harness Author", commits: 1 },
  ]);
  assert.equal(evidence.localRepos[0].git.commits[0].author, "Harness Author");
  assert.equal(
    evidence.localRepos[0].git.commits[0].message,
    "Add structured CLI"
  );
  assert.ok(
    evidence.codeBlobs.some(
      (blob) =>
        blob.path === "engine.ts" && blob.content.includes("local-code-fixture")
    )
  );
  assert.ok(
    evidence.dependencyFiles.some((files) =>
      files.packageJson?.includes("harness-demo")
    )
  );
  assert.ok(evidence.limitations.length > 0);
  assert.ok(evidence.limitations.every((item) => typeof item === "string"));
  assert.doesNotMatch(
    evidenceText,
    /privateFixture|unused-openai|unused-anthropic|fixture-github-token/
  );
  assert.equal(evidenceText.includes(root), false);
  const urls = readFileSync(requests, "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.ok(urls.length > 0);
  assert.ok(urls.every((url) => new URL(url).hostname === "api.github.com"));
});

test("collect requires an evidence destination and removes model-provider options", (t) => {
  const { root, requests, node } = fixture(t);
  const help = node([cli, "collect", "--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--evidence/);
  assert.doesNotMatch(help.stdout, /--provider|--model|--prompts|--yes/);
  const missingEvidence = node([cli, "collect", "developer"]);
  assert.equal(missingEvidence.status, 1);
  assert.match(missingEvidence.stderr, /evidence/);
  for (const [flag, value] of [
    ["--provider", "openai"],
    ["--model", "model-fixture"],
    ["--prompts", "prompts"],
  ]) {
    const result = node([
      cli,
      "collect",
      "developer",
      "--evidence",
      join(root, "evidence.json"),
      flag,
      value,
    ]);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /unknown option/);
  }
  assert.equal(existsSync(requests), false);
});

test("collect rewrites existing evidence with private file permissions", (t) => {
  const { root, node } = fixture(t);
  const evidenceFile = join(root, "evidence.json");
  const profileFile = join(root, "profile.json");
  writeFileSync(evidenceFile, "previous evidence");
  chmodSync(evidenceFile, 0o644);
  assert.equal(statSync(evidenceFile).mode & 0o777, 0o644);

  const result = node(
    [
      cli,
      "collect",
      "developer",
      "--evidence",
      evidenceFile,
      "--output",
      profileFile,
    ],
    { GITHUB_TOKEN: "fixture-github-token" }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(statSync(evidenceFile).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(evidenceFile, "utf8")).schemaVersion, 1);
  assert.equal(
    JSON.parse(readFileSync(profileFile, "utf8")).identity.username,
    "developer"
  );
});

test("collect rejects an evidence symlink before fetching or changing output", (t) => {
  const { root, requests, node } = fixture(t);
  const targetFile = join(root, "existing-target.json");
  const evidenceFile = join(root, "evidence-link.json");
  const profileFile = join(root, "profile.json");
  writeFileSync(targetFile, "keep the existing target");
  writeFileSync(profileFile, "keep the existing profile");
  symlinkSync(targetFile, evidenceFile);
  const result = node(
    [
      cli,
      "collect",
      "developer",
      "--evidence",
      evidenceFile,
      "--output",
      profileFile,
    ],
    { GITHUB_TOKEN: "fixture-github-token" }
  );
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(readFileSync(targetFile, "utf8"), "keep the existing target");
  assert.equal(readFileSync(profileFile, "utf8"), "keep the existing profile");
  assert.equal(existsSync(requests), false);
});

test("collect rejects profile/evidence path collisions before fetching", async (t) => {
  for (const hardlinked of [false, true]) {
    await t.test(hardlinked ? "hardlinked files" : "identical path", (t) => {
      const { root, requests, node } = fixture(t);
      const profileFile = join(root, "profile.json");
      const evidenceFile = hardlinked
        ? join(root, "evidence.json")
        : profileFile;
      writeFileSync(profileFile, "keep the existing data");
      if (hardlinked) linkSync(profileFile, evidenceFile);
      const result = node(
        [
          cli,
          "collect",
          "developer",
          "--evidence",
          evidenceFile,
          "--output",
          profileFile,
        ],
        { GITHUB_TOKEN: "fixture-github-token" }
      );
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stdout, "");
      assert.equal(readFileSync(profileFile, "utf8"), "keep the existing data");
      assert.equal(
        readFileSync(evidenceFile, "utf8"),
        "keep the existing data"
      );
      assert.equal(existsSync(requests), false);
    });
  }
});

test("collect rejects a dangling profile symlink pointing at the evidence destination", (t) => {
  const { root, requests, node } = fixture(t);
  const evidenceFile = join(root, "evidence.json");
  const profileFile = join(root, "profile-link.json");
  symlinkSync(evidenceFile, profileFile);
  assert.equal(existsSync(evidenceFile), false);
  const result = node(
    [
      cli,
      "collect",
      "developer",
      "--evidence",
      evidenceFile,
      "--output",
      profileFile,
    ],
    { GITHUB_TOKEN: "fixture-github-token" }
  );
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(existsSync(evidenceFile), false);
  assert.equal(readlinkSync(profileFile), evidenceFile);
  assert.equal(existsSync(requests), false);
});

test("analysis-schema prints a complete JSON contract without credentials or network access", (t) => {
  const { requests, node } = fixture(t);
  const result = node([cli, "analysis-schema"], {
    GITHUB_TOKEN: "unused-github-schema-fixture",
    OPENAI_API_KEY: "unused-openai-schema-fixture",
    ANTHROPIC_API_KEY: "unused-anthropic-schema-fixture",
  });
  assert.equal(result.status, 0, result.stderr);
  const schema = JSON.parse(result.stdout);
  assert.equal(schema.type, "object");
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.minProperties, 1);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), [
    "knowledge",
    "overview",
  ]);
  assert.deepEqual(schema.required, []);

  const { knowledge, overview } = schema.properties;
  assert.equal(knowledge.type, "object");
  assert.equal(knowledge.additionalProperties, false);
  assert.deepEqual(
    knowledge.required.toSorted(),
    Object.keys(analysisFixture().knowledge).sort()
  );
  assert.deepEqual(
    Object.keys(knowledge.properties).sort(),
    knowledge.required.toSorted()
  );
  for (const [name, category] of Object.entries(knowledge.properties)) {
    assert.equal(category.type, "array", name);
    assert.equal(category.items.type, "object", name);
    assert.equal(category.items.additionalProperties, false, name);
  }
  assert.deepEqual(
    knowledge.properties.apiDesign.items.properties.confidence.enum.toSorted(),
    ["high", "low", "medium"]
  );
  assert.deepEqual(
    knowledge.properties.techStack.items.properties.category.enum.toSorted(),
    [
      "cloud",
      "database",
      "devtool",
      "framework",
      "infrastructure",
      "language",
      "library",
    ]
  );
  assert.equal(overview.type, "object");
  assert.equal(overview.additionalProperties, false);
  assert.deepEqual(
    overview.required.toSorted(),
    Object.keys(analysisFixture().overview).sort()
  );
  assert.deepEqual(
    Object.keys(overview.properties).sort(),
    overview.required.toSorted()
  );
  assert.deepEqual(overview.properties.seniorityLevel.enum.toSorted(), [
    "junior",
    "mid",
    "principal",
    "senior",
    "staff",
  ]);
  assert.deepEqual(
    overview.properties.roleFit.required.toSorted(),
    Object.keys(analysisFixture().overview.roleFit).sort()
  );
  assert.deepEqual(
    overview.properties.roleFit.properties.environment.enum.toSorted(),
    ["either", "enterprise", "startup"]
  );
  assert.doesNotMatch(
    result.stdout,
    /unused-(github|openai|anthropic)-schema-fixture/
  );
  assert.equal(existsSync(requests), false);
});

test("attach-analysis accepts harness results and preserves collected profile data", (t) => {
  const { root, requests, node } = fixture(t);
  const profile = profileFixture();
  const analysis = analysisFixture();
  const profileFile = join(root, "profile.json");
  const analysisFile = join(root, "analysis.json");
  const output = join(root, "completed.json");
  writeFileSync(profileFile, JSON.stringify(profile));
  writeFileSync(analysisFile, JSON.stringify(analysis));
  const originalProfileText = readFileSync(profileFile, "utf8");
  const before = Date.now();
  const result = node([
    cli,
    "attach-analysis",
    profileFile,
    analysisFile,
    "--output",
    output,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  const completed = JSON.parse(readFileSync(output, "utf8"));
  assert.deepEqual(completed.analysis, analysis);
  const { analysis: _analysis, analyzedAt, ...collected } = completed;
  const { analyzedAt: _originalTimestamp, ...expected } = profile;
  assert.deepEqual(collected, expected);
  assert.ok(Date.parse(analyzedAt) >= before);
  assert.ok(Date.parse(analyzedAt) <= Date.now());
  assert.equal(readFileSync(profileFile, "utf8"), originalProfileText);
  assert.equal(existsSync(requests), false);

  const stdout = node([cli, "attach-analysis", profileFile, analysisFile]);
  assert.equal(stdout.status, 0, stdout.stderr);
  assert.deepEqual(JSON.parse(stdout.stdout).analysis, analysis);
});

test("attach-analysis accepts either section and replaces earlier analysis", (t) => {
  const { root, node } = fixture(t);
  const profileFile = join(root, "profile.json");
  const analysisFile = join(root, "analysis.json");
  const original = { ...profileFixture(), analysis: analysisFixture() };
  writeFileSync(profileFile, JSON.stringify(original));
  for (const section of ["knowledge", "overview"]) {
    const analysis = { [section]: analysisFixture()[section] };
    writeFileSync(analysisFile, JSON.stringify(analysis));
    const result = node([cli, "attach-analysis", profileFile, analysisFile]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).analysis, analysis);
  }
});

test("attach-analysis validates every supplied section and rejects unsafe output", async (t) => {
  const cases = [
    ["malformed JSON", "{not-json"],
    ["empty analysis", {}],
    [
      "invalid seniority",
      { overview: { ...analysisFixture().overview, seniorityLevel: "expert" } },
    ],
    [
      "invalid array",
      { overview: { ...analysisFixture().overview, strengths: "TypeScript" } },
    ],
    [
      "invalid confidence",
      {
        knowledge: {
          ...analysisFixture().knowledge,
          apiDesign: [
            {
              ...analysisFixture().knowledge.apiDesign[0],
              confidence: "certain",
            },
          ],
        },
      },
    ],
    [
      "invalid evidence items",
      {
        knowledge: {
          ...analysisFixture().knowledge,
          apiDesign: [
            { ...analysisFixture().knowledge.apiDesign[0], evidence: [42] },
          ],
        },
      },
    ],
    [
      "unknown analysis field",
      { ...analysisFixture(), privateNotes: "Unexpected field" },
    ],
    [
      "unknown nested field",
      {
        overview: { ...analysisFixture().overview, rawSource: "sample source" },
      },
    ],
    ["raw evidence", { ...analysisFixture(), evidence: { codeBlobs: [] } }],
    [
      "credentials",
      {
        overview: {
          ...analysisFixture().overview,
          executiveSummary: 'PASSWORD="fixture-private-value"',
        },
      },
    ],
  ];
  for (const [name, value] of cases) {
    await t.test(name, (t) => {
      const { root, requests, node } = fixture(t);
      const profileFile = join(root, "profile.json");
      const analysisFile = join(root, "analysis.json");
      const output = join(root, "completed.json");
      const profileText = JSON.stringify(profileFixture());
      writeFileSync(profileFile, profileText);
      writeFileSync(
        analysisFile,
        typeof value === "string" ? value : JSON.stringify(value)
      );
      const result = node([
        cli,
        "attach-analysis",
        profileFile,
        analysisFile,
        "--output",
        output,
      ]);
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stdout, "");
      assert.equal(existsSync(output), false);
      assert.equal(readFileSync(profileFile, "utf8"), profileText);
      assert.equal(existsSync(requests), false);
    });
  }
});

test("publish rejects private evidence before making a network request", (t) => {
  const { root, requests, node } = fixture(t);
  mkdirSync(join(root, ".topsignal"), { mode: 0o700 });
  writeFileSync(
    join(root, ".topsignal", "auth.json"),
    JSON.stringify({
      access_token: "fixture-auth-token",
      username: "developer",
    }),
    { mode: 0o600 }
  );
  const evidenceFile = join(root, "evidence.json");
  const evidence = {
    schemaVersion: 1,
    username: "developer",
    collectedAt: timestamp,
    localRepos: [],
    codeBlobs: [
      {
        repoName: "private-project",
        path: "engine.ts",
        content: "private-source-fixture",
      },
    ],
    dependencyFiles: [],
    limitations: [],
  };
  for (const value of [evidence, { ...profileFixture(), evidence }]) {
    writeFileSync(evidenceFile, JSON.stringify(value));
    const result = node([cli, "publish", evidenceFile]);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(existsSync(requests), false);
  }
});
