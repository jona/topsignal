import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const cli = fileURLToPath(
  new URL("../dist/entrypoints/cli/index.js", import.meta.url)
);
const limitsModule = new URL("../dist/limits.js", import.meta.url).href;
const executableEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    /^(PATH|PATHEXT|SystemRoot|windir)$/i.test(key)
  )
);

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "topsignal-cli-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const setup = join(root, "setup.mjs");
  writeFileSync(
    setup,
    `import os from "node:os";
import { syncBuiltinESMExports } from "node:module";
os.homedir = () => ${JSON.stringify(root)};
syncBuiltinESMExports();
globalThis.fetch = async () => { throw new Error("Unexpected network request"); };
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
        timeout: 10_000,
      }
    );
  }

  return { root, node, env };
}

test("git-log reports first and last dates independently of the commit sample", (t) => {
  const { root, node, env } = fixture(t);
  const repo = join(root, "repository");
  mkdirSync(repo);

  function git(args, date) {
    return execFileSync("git", args, {
      cwd: repo,
      env: {
        ...env,
        GIT_AUTHOR_NAME: "Fixture Author",
        GIT_AUTHOR_EMAIL: "author@example.test",
        GIT_COMMITTER_NAME: "Fixture Committer",
        GIT_COMMITTER_EMAIL: "committer@example.test",
        ...(date && { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }),
      },
      input: "",
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
  }

  // This root precedes the second root in UTC despite its later local date.
  const firstDate = "2021-01-01T00:30:00+02:00";
  const lastDate = "2024-05-03T12:00:00+00:00";
  git(["init", "--quiet", "--initial-branch=main"]);
  git(["commit", "--allow-empty", "--quiet", "-m", "First"], firstDate);
  git(["commit", "--allow-empty", "--quiet", "-m", "Last"], lastDate);
  const tree = git(["rev-parse", "HEAD^{tree}"]);
  const otherRoot = git(
    ["commit-tree", tree, "-m", "Other root"],
    "2020-12-31T23:00:00+00:00"
  );
  git(["update-ref", "refs/heads/other", otherRoot]);

  for (const sample of [0, 1]) {
    const result = node([
      cli,
      "git-log",
      repo,
      "--commits",
      String(sample),
      "--blobs",
      "0",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.totalCommits, 3);
    assert.equal(report.commits.length, sample);
    assert.equal(Date.parse(report.firstCommitDate), Date.parse(firstDate));
    assert.equal(Date.parse(report.lastCommitDate), Date.parse(lastDate));
  }
});

test("CLI rejects malformed and out-of-range numeric flags", (t) => {
  const { node } = fixture(t);
  for (const [args, min, max] of [
    [["scan-repos", "--depth", "3files"], 0, 100],
    [["git-log", ".", "--commits", "10001"], 0, 10000],
    [["git-log", ".", "--blobs", "101"], 0, 100],
    [["analyze", "developer", "--depth", "101"], 0, 100],
    [["analyze", "developer", "--repos", "0"], 1, 100],
    [["analyze", "developer", "--commits-per-repo", "0"], 1, 100],
  ]) {
    const result = node([cli, ...args]);
    assert.equal(result.status, 1, result.stderr);
    const flag = args.at(-2);
    assert.ok(
      result.stderr.includes(
        `${flag} must be an integer from ${min} to ${max}`
      ),
      result.stderr
    );
  }
  const result = node([cli, "scan-repos", "--depth", "0"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
});

test("fetch limits resolve flags before env, config, and defaults", (t) => {
  const { root, node } = fixture(t);
  const configDir = join(root, ".topsignal");
  mkdirSync(configDir);
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({
      repos: 12,
      starred: 13,
      issues: 14,
      depFileRepos: 0,
      commitRepos: 0,
      blobRepos: 0,
      filesPerBlobRepo: 0,
    })
  );

  const result = node(
    [
      "--input-type=module",
      "--eval",
      `import { resolveLimits } from ${JSON.stringify(limitsModule)};
process.stdout.write(JSON.stringify(resolveLimits({ repos: 100 })));`,
    ],
    { TOPSIGNAL_REPOS: "16", TOPSIGNAL_STARRED: "17" }
  );
  assert.equal(result.status, 0, result.stderr);
  const limits = JSON.parse(result.stdout);
  assert.equal(limits.repos, 100);
  assert.equal(limits.starred, 17);
  assert.equal(limits.issues, 14);
  assert.equal(limits.gists, 30);
  for (const key of [
    "depFileRepos",
    "commitRepos",
    "blobRepos",
    "filesPerBlobRepo",
  ]) {
    assert.equal(limits[key], 0);
  }
});

test("analyze rejects invalid effective env and config limits before fetching", (t) => {
  const { root, node } = fixture(t);
  const configDir = join(root, ".topsignal");
  mkdirSync(configDir);
  const config = join(configDir, "config.json");
  const command = [cli, "analyze", "developer"];
  const fakeToken = { GITHUB_TOKEN: "test-token" };

  writeFileSync(config, JSON.stringify({ repos: "25" }));
  let result = node(command, fakeToken);
  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stderr,
    /config\.json: repos must be an integer from 1 to 100/
  );

  result = node(command, { ...fakeToken, TOPSIGNAL_REPOS: "25extra" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stderr,
    /TOPSIGNAL_REPOS must be an integer from 1 to 100/
  );

  writeFileSync(config, "[]");
  result = node(command, fakeToken);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Invalid TopSignal fetch limits configuration/);
});
