import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  analyzeKnowledge,
  buildKnowledgePrompt,
} from "../dist/analyzers/code-analyzer.js";
import {
  analyzeOverview,
  buildOverviewPrompt,
} from "../dist/analyzers/overview-analyzer.js";
import { setPromptsDir } from "../dist/analyzers/prompts.js";
import { fetchCodeBlobs } from "../dist/github/fetcher/blobs.js";
import { fetchDependencyFiles } from "../dist/github/fetcher/deps.js";
import {
  redactOutboundText,
  screenOutboundFile,
} from "../dist/privacy/outbound.js";

test("omits files with incomplete private keys and fully redacts blocks in metadata", () => {
  const start = "-----BEGIN ENCRYPTED PRIVATE KEY-----";
  const body = "demonstration-only-body";
  const end = "-----END ENCRYPTED PRIVATE KEY-----";
  assert.equal(screenOutboundFile([start, body].join("\n")), null);
  assert.equal(
    redactOutboundText(["before", start, body, end, "after"].join("\n")),
    "before\n[REDACTED]\nafter"
  );
  assert.equal(
    redactOutboundText(["before", start, body].join("\n")),
    "before\n[REDACTED]"
  );
  assert.equal(
    redactOutboundText('{"PASSWORD":"mock-value-with-\\"-inside"}'),
    '{"PASSWORD":"[REDACTED]"}'
  );
  assert.equal(screenOutboundFile("x".repeat(1024 * 1024 + 1)), null);
});

test("custom prompts screen files, metadata and the template itself before sending", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "topsignal-outbound-"));
  t.after(() => {
    setPromptsDir();
    rmSync(dir, { recursive: true, force: true });
  });
  setPromptsDir(dir);
  writeFileSync(
    join(dir, "knowledge.md"),
    'Sources:\n{{sourceCode}}\nConfigs:\n{{configFiles}}\n{{stats}}\nPASSWORD="fake-template-value"'
  );
  writeFileSync(join(dir, "overview.md"), "{{profile}}");

  const knowledge = buildKnowledgePrompt(
    [
      {
        repoName: "demo",
        path: "safe.ts",
        language: "TypeScript",
        content: "export const demonstration = true;",
      },
      {
        repoName: "demo",
        path: "unsafe.ts",
        language: "TypeScript",
        content: 'const ACCESS_TOKEN = "fake-source-value";',
      },
    ],
    [
      {
        repoName: "demo",
        packageJson: '{"name":"ordinary-package"}',
        readme: 'PASSWORD = "fake-docs-value"',
      },
    ],
    {
      codeReviewCount: 0,
      externalPRCount: 0,
      issueCount: 0,
      totalCommits: 0,
      contributedRepoCount: 1,
      contributedRepoNames: ['PASSWORD="fake-context-value"'],
      hasSponsorListing: false,
      sponsorCount: 0,
    }
  );
  const overview = buildOverviewPrompt({
    identity: {
      name: "Example developer",
      bio: 'PASSWORD="fake-profile-value"',
      credentials: { accessToken: "fake-profile-token" },
    },
  });
  assert.match(knowledge, /safe\.ts/);
  assert.match(knowledge, /ordinary-package/);
  assert.doesNotMatch(
    knowledge,
    /unsafe\.ts|fake-(source|docs|context|template)-value/
  );
  assert.deepEqual(JSON.parse(overview).identity, {
    name: "Example developer",
    bio: 'PASSWORD="[REDACTED]"',
    credentials: { accessToken: "[REDACTED]" },
  });

  const sent = [];
  const provider = {
    name: "test-provider",
    async sendMessage(prompt) {
      sent.push(prompt);
      return "{}";
    },
  };
  await analyzeKnowledge(provider, knowledge);
  await assert.rejects(
    analyzeOverview(provider, overview),
    /expected profile format/
  );
  assert.deepEqual(sent, [knowledge, overview]);
});

test("GitHub documents are screened before truncation and gated by visibility", async (t) => {
  const text = "x".repeat(2980) + '\nPASSWORD = "fake-clipped-docs-value"';
  t.mock.method(globalThis, "fetch", async (_url, request) => {
    const { query, variables } = JSON.parse(request.body);
    assert.match(query, /visibility/);
    assert.deepEqual(variables, { owner: "demo" });
    return Response.json({
      data: {
        r0: {
          visibility: "PUBLIC",
          readme: { text },
          packageJson: {
            text: '{"name":"ordinary-package","author":"Sample author","dependencies":{"safe":"1.0.0"}}',
          },
        },
        r1: {
          visibility: "INTERNAL",
          readme: { text: "internal sample" },
        },
      },
    });
  });

  const files = await fetchDependencyFiles(
    "demo-token",
    "demo",
    [
      { name: "public-demo", full_name: "demo/public-demo", fork: false },
      { name: "internal-demo", full_name: "demo/internal-demo", fork: false },
    ],
    2
  );
  assert.deepEqual(
    files.map((file) => file.repoName),
    ["demo/public-demo"]
  );
  assert.equal(files[0].readme, null);
  assert.deepEqual(JSON.parse(files[0].packageJson), {
    name: "ordinary-package",
    dependencies: { safe: "1.0.0" },
  });
});

test("GitHub source fetch screens credentials and rechecks visibility with the blob", async (t) => {
  const names = ["engine.ts", "core.ts", "worker.ts"];
  t.mock.method(globalThis, "fetch", async (_url, request) => {
    const { query, variables } = JSON.parse(request.body);
    assert.match(query, /visibility/);
    if (query.includes("query CodeTrees(")) {
      return Response.json({
        data: {
          r0: {
            visibility: "PUBLIC",
            root: { entries: names.map((name) => ({ name, type: "blob" })) },
          },
        },
      });
    }

    assert.match(query, /query FetchBlobs\(/);
    assert.deepEqual(variables, {
      owner: "demo",
      path0: "HEAD:engine.ts",
      path1: "HEAD:core.ts",
      path2: "HEAD:worker.ts",
    });
    const blob = (text) => ({ text, byteSize: text.length });
    return Response.json({
      data: {
        b0: { visibility: "PUBLIC", blob: blob("const engine = true;") },
        b1: {
          visibility: "PUBLIC",
          blob: blob('const PASSWORD = "fake-source-value";'),
        },
        b2: { visibility: "PRIVATE", blob: blob("const worker = true;") },
      },
    });
  });

  const blobs = await fetchCodeBlobs(
    "demo-token",
    "demo",
    [{ name: "repo", full_name: "demo/repo", size: 1, fork: false }],
    1,
    3
  );
  assert.deepEqual(
    blobs.map((blob) => blob.path),
    ["engine.ts"]
  );
});
