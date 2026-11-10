import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeLocalSamples } from "../dist/local/samples.js";

function blob(repoName, path) {
  return {
    repoName,
    path,
    content: "const fixture = true;",
    language: "TypeScript",
  };
}

function local(name, remote, path, readme) {
  return {
    name,
    remote,
    codeBlobs: [blob(name, path)],
    dependencyFiles: { repoName: name, readme },
  };
}

test("merges by GitHub origin across SSH, HTTPS, case, and renamed clones", () => {
  const wave2 = {
    codeBlobs: [blob("Owner/Project", "remote.ts")],
    dependencyFiles: [{ repoName: "Owner/Project", readme: null }],
  };
  const result = mergeLocalSamples(wave2, [
    local(
      "renamed",
      "git@github.com:OWNER/project.git",
      "local.ts",
      "Local docs"
    ),
    local(
      "second-clone",
      "https://github.com/owner/Project.git/",
      "duplicate.ts",
      "Duplicate docs"
    ),
  ]);
  assert.deepEqual(
    wave2.codeBlobs.map(({ path }) => path),
    ["remote.ts"]
  );
  assert.deepEqual(wave2.dependencyFiles, [
    { repoName: "Owner/Project", readme: "Local docs" },
  ]);
  assert.deepEqual(result, {
    addedBlobs: 0,
    localRepoNames: ["Owner/Project"],
  });
});

test("keeps unrelated repos with the same basename distinct", () => {
  const wave2 = {
    codeBlobs: [blob("Owner/Project", "remote.ts")],
    dependencyFiles: [],
  };
  mergeLocalSamples(wave2, [
    local(
      "Project",
      "ssh://git@ssh.github.com:443/Other/Project.git",
      "other.ts",
      null
    ),
    local(
      "Project",
      "https://git.example.test/owner/Project.git",
      "custom.ts",
      null
    ),
    local("Project", null, "local.ts", null),
  ]);
  assert.deepEqual(
    wave2.codeBlobs.map(({ repoName }) => repoName),
    ["Owner/Project", "other/project", "Project", "Project (local 2)"]
  );
});
