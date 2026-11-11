import assert from "node:assert/strict";
import test from "node:test";

import { fetchCodeBlobs } from "../dist/github/fetcher/blobs.js";
import { fetchDependencyFiles } from "../dist/github/fetcher/deps.js";
import {
  redactOutboundText,
  sanitizeOutboundValue,
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

test("evidence screens whole files and redacts metadata before serialization", async () => {
  const { buildEvidence } = await import("../dist/evidence.js");
  const evidence = buildEvidence(
    "demo",
    "2026-01-01T00:00:00Z",
    {
      codeBlobs: [
        {
          repoName: "demo",
          path: "safe.ts",
          language: "TypeScript",
          content: "export const example = true;",
        },
        {
          repoName: "demo",
          path: "unsafe.ts",
          language: "TypeScript",
          content: 'const PASSWORD = "fixture-source-secret";',
        },
      ],
      dependencyFiles: [
        {
          repoName: "demo",
          packageJson: '{"name":"safe-package"}',
          readme: 'PASSWORD="fixture-doc-secret"',
        },
      ],
    },
    [
      {
        name: 'PASSWORD="fixture-metadata-secret"',
        path: "demo",
        remote: null,
        git: {
          authors: [],
          commits: [],
          totalCommits: 0,
          firstCommitDate: null,
          lastCommitDate: null,
        },
      },
    ]
  );
  assert.deepEqual(
    evidence.codeBlobs.map((b) => b.path),
    ["safe.ts"]
  );
  assert.equal(evidence.dependencyFiles[0].readme, null);
  assert.doesNotMatch(
    JSON.stringify(evidence),
    /fixture-(source|doc|metadata)-secret/
  );
  assert.deepEqual(sanitizeOutboundValue({ accessToken: "fixture-value" }), {
    accessToken: "[REDACTED]",
  });
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
