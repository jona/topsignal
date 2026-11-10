import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readCodeBlobs, readDependencyFiles } from "../dist/local/files.js";
import { scanForRepos } from "../dist/local/scanner.js";

const source = `export const example = "${"sample text ".repeat(12)}";\n`;

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "topsignal-local-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function git(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

function makeRepo(parent, name) {
  const repo = join(parent, name);
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q");
  return repo;
}

test("reads tracked source and manifests once and skips untracked files", (t) => {
  const root = fixture(t);
  const repo = makeRepo(root, "inside");
  mkdirSync(join(repo, "src"));
  const tracked = "src/space in name.ts";
  writeFileSync(join(repo, tracked), source);
  writeFileSync(join(repo, "src/engine-untracked.ts"), source);
  writeFileSync(
    join(repo, "package.json"),
    '{"name":"sample","author":"Example"}'
  );
  writeFileSync(join(repo, "README.md"), "Untracked notes");
  git(repo, "add", "--", tracked, "package.json");

  assert.deepEqual(
    readCodeBlobs(repo, undefined, root).map((blob) => blob.path),
    [tracked]
  );
  const deps = readDependencyFiles(repo, root);
  assert.deepEqual(JSON.parse(deps.packageJson), { name: "sample" });
  assert.equal(deps.readme, null);
});

test(
  "does not discover repositories through symlink directories",
  { skip: process.platform === "win32" },
  (t) => {
    const root = fixture(t);
    const scope = join(root, "scope");
    const inside = makeRepo(scope, "inside");
    const outside = makeRepo(root, "outside");
    symlinkSync(outside, join(scope, "alias"), "dir");

    assert.deepEqual(
      scanForRepos(scope).map((repo) => repo.path),
      [inside]
    );
    assert.deepEqual(scanForRepos(join(scope, "alias")), []);
  }
);

test(
  "skips symlink, hardlink, and special paths even when Git tracks the path",
  { skip: process.platform === "win32" },
  (t) => {
    const root = fixture(t);
    const repo = makeRepo(root, "inside");
    const sample = join(root, "sample.ts");
    writeFileSync(sample, source);
    for (const name of ["package.json", "hard.ts", "pipe.ts", "kept.ts"]) {
      writeFileSync(join(repo, name), source);
    }
    symlinkSync(sample, join(repo, "registered.ts"), "file");
    git(repo, "add", "--", ".");

    for (const name of [
      "package.json",
      "hard.ts",
      "pipe.ts",
      "registered.ts",
    ]) {
      rmSync(join(repo, name));
    }
    symlinkSync(sample, join(repo, "package.json"), "file");
    linkSync(sample, join(repo, "hard.ts"));
    execFileSync("mkfifo", [join(repo, "pipe.ts")]);
    writeFileSync(join(repo, "registered.ts"), source);

    assert.equal(readDependencyFiles(repo, root).packageJson, null);
    assert.deepEqual(
      readCodeBlobs(repo, undefined, root).map((blob) => blob.path),
      ["kept.ts"]
    );
  }
);

test(
  "rechecks the approved root if a discovered repository path changes",
  { skip: process.platform === "win32" },
  (t) => {
    const root = fixture(t);
    const scope = join(root, "scope");
    const repo = makeRepo(join(scope, "group"), "inside");
    writeFileSync(join(repo, "file.ts"), source);
    git(repo, "add", "--", "file.ts");
    assert.deepEqual(
      scanForRepos(scope).map((entry) => entry.path),
      [repo]
    );

    const movedGroup = join(root, "moved-group");
    renameSync(join(scope, "group"), movedGroup);
    symlinkSync(movedGroup, join(scope, "group"), "dir");
    assert.deepEqual(readCodeBlobs(repo, undefined, scope), []);
  }
);

test("reads files in a linked worktree rooted within the scan scope", (t) => {
  const root = fixture(t);
  const repo = makeRepo(root, "main");
  const scope = join(root, "scope");
  const linked = join(scope, "linked");
  mkdirSync(scope);
  writeFileSync(join(repo, "file.ts"), source);
  git(repo, "add", "--", "file.ts");
  git(
    repo,
    "-c",
    "user.name=Sample",
    "-c",
    "user.email=sample@example.test",
    "commit",
    "--no-gpg-sign",
    "-qm",
    "Initial commit"
  );
  git(repo, "worktree", "add", "--detach", linked);

  assert.deepEqual(
    scanForRepos(scope).map((entry) => entry.path),
    [linked]
  );
  assert.deepEqual(
    readCodeBlobs(linked, undefined, scope).map((blob) => blob.path),
    ["file.ts"]
  );
});
