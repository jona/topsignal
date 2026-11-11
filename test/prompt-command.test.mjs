import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const executableEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    /^(PATH|PATHEXT|SystemRoot|windir)$/i.test(key)
  )
);
const hash = (value) => createHash("sha256").update(value).digest("hex");

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
    env: executableEnv,
    ...options,
  });
}

function packedFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "topsignal packed prompts "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const packed = run(
    "npm",
    [
      "pack",
      "--ignore-scripts",
      "--offline",
      "--json",
      "--cache",
      join(root, "npm cache"),
      "--pack-destination",
      root,
    ],
    { cwd: repo }
  );
  assert.equal(packed.status, 0, packed.stderr);
  const metadata = JSON.parse(packed.stdout)[0];
  const install = join(root, "installed package with spaces");
  mkdirSync(install);
  const extraction = run("tar", [
    "-xzf",
    join(root, metadata.filename),
    "-C",
    install,
  ]);
  assert.equal(extraction.status, 0, extraction.stderr);
  const packageRoot = join(install, "package");
  // Use existing dependencies read-only; exercise the files from the real tarball.
  symlinkSync(
    realpathSync(join(repo, "node_modules")),
    join(packageRoot, "node_modules"),
    "dir"
  );
  const cwd = join(root, "outside repository working directory");
  mkdirSync(cwd);
  const marker = join(root, "unexpected runtime I-O.jsonl");
  const setup = join(root, "runtime guard.mjs");
  writeFileSync(
    setup,
    `import os from "node:os";
import childProcess from "node:child_process";
import { appendFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
os.homedir = () => ${JSON.stringify(root)};
const denied = (kind) => (...args) => {
  appendFileSync(${JSON.stringify(marker)}, JSON.stringify({kind, first: String(args[0])}) + "\\n");
  throw new Error("Prompt command attempted forbidden runtime I/O: " + kind);
};
for (const name of ["exec", "execFile", "execSync", "execFileSync", "spawn", "spawnSync", "fork"]) {
  childProcess[name] = denied(name);
}
syncBuiltinESMExports();
globalThis.fetch = denied("fetch");
`
  );
  const cli = join(packageRoot, "dist", "entrypoints", "cli", "index.js");
  function node(args) {
    return run(
      process.execPath,
      ["--import", pathToFileURL(setup).href, cli, ...args],
      {
        cwd,
        env: {
          ...executableEnv,
          OPENAI_API_KEY: "unused-openai-fixture-key",
          ANTHROPIC_API_KEY: "unused-anthropic-fixture-key",
          GITHUB_TOKEN: "unused-github-fixture-token",
        },
      }
    );
  }
  return { root, metadata, packageRoot, cwd, marker, node };
}

function jsonPrompt(node, args = []) {
  const result = node(["analysis-prompt", ...args, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  return { result, exported: JSON.parse(result.stdout) };
}

function sampleFor(schema) {
  if (schema.type === "array") return [];
  if (schema.type === "string") return schema.enum?.[0] ?? "";
  return Object.fromEntries(
    schema.required.map((key) => [key, sampleFor(schema.properties[key])])
  );
}

test("analysis-prompt works from a packed package outside the repository", async (t) => {
  const { root, metadata, packageRoot, cwd, marker, node } = packedFixture(t);

  await t.test("reports the version declared by the packed package", () => {
    const manifest = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf8")
    );
    const version = node(["--version"]);
    assert.equal(version.status, 0, version.stderr);
    assert.equal(version.stdout.trim(), manifest.version);
    assert.equal(manifest.version, metadata.version);
    assert.equal(version.stderr, "");
  });

  await t.test(
    "ships every Markdown asset and deterministically exports the all-section contract",
    () => {
      for (const name of ["common.md", "knowledge.md", "overview.md"]) {
        assert.ok(
          metadata.files.some((file) => file.path === `prompts/${name}`),
          name
        );
      }
      const first = jsonPrompt(node);
      const second = jsonPrompt(node, ["all"]);
      assert.equal(first.result.stdout, second.result.stdout);
      const value = first.exported;
      assert.equal(value.promptVersion, "1.0.0");
      assert.equal(value.section, "all");
      assert.equal(value.sha256, hash(Buffer.from(value.prompt, "utf8")));
      assert.equal(value.estimatedTokens, Math.ceil(value.prompt.length / 4));
      assert.match(value.tokenEstimateMethod, /estimate/i);
      assert.ok(value.prompt.endsWith("\n"));
      assert.equal(value.prompt.endsWith("\n\n"), false);
      assert.deepEqual(value.schema.required, ["knowledge", "overview"]);
      assert.deepEqual(Object.keys(value.schema.properties), [
        "knowledge",
        "overview",
      ]);
      assert.equal(value.schema.additionalProperties, false);
      assert.equal(value.schema.minProperties, 2);
      assert.deepEqual(
        value.sources,
        ["common.md", "knowledge.md", "overview.md"].map((name) => ({
          name,
          kind: "bundled",
          sha256: hash(readFileSync(join(packageRoot, "prompts", name))),
        }))
      );
      assert.ok(value.prompt.includes(JSON.stringify(value.schema, null, 2)));
      const plain = node(["analysis-prompt"]);
      assert.equal(plain.status, 0, plain.stderr);
      assert.equal(plain.stdout, value.prompt);
      assert.equal(plain.stderr, "");
    }
  );

  await t.test(
    "each section exports an attach-compatible wrapper, and all requires both",
    () => {
      const profile = join(cwd, "profile.json");
      writeFileSync(
        profile,
        JSON.stringify({ identity: { username: "fixture" }, repos: [] })
      );
      for (const section of ["knowledge", "overview", "all"]) {
        const { exported } = jsonPrompt(node, [section]);
        const selected =
          section === "all" ? ["knowledge", "overview"] : [section];
        assert.deepEqual(exported.schema.required, selected);
        assert.deepEqual(Object.keys(exported.schema.properties), selected);
        const fixture = sampleFor(exported.schema);
        assert.deepEqual(Object.keys(fixture), selected);
        const analysisFile = join(cwd, `${section} analysis.json`);
        writeFileSync(analysisFile, JSON.stringify(fixture));
        const attached = node(["attach-analysis", profile, analysisFile]);
        assert.equal(attached.status, 0, attached.stderr);
        assert.deepEqual(JSON.parse(attached.stdout).analysis, fixture);
      }
    }
  );

  await t.test(
    "loads explicit per-file overrides and retains bundled shared safeguards",
    () => {
      const custom = join(cwd, "custom prompts with spaces");
      mkdirSync(custom);
      const override =
        "# Custom knowledge\r\n\r\nCustom-knowledge-fixture.\r\n";
      writeFileSync(join(custom, "knowledge.md"), override);
      writeFileSync(join(custom, "common.md"), "DO-NOT-USE-CUSTOM-COMMON");
      const { exported } = jsonPrompt(node, ["all", "--prompts", custom]);
      assert.match(exported.prompt, /Custom-knowledge-fixture\./);
      assert.doesNotMatch(exported.prompt, /DO-NOT-USE-CUSTOM-COMMON|\r/);
      assert.deepEqual(
        exported.sources.map(({ name, kind }) => ({ name, kind })),
        [
          { name: "common.md", kind: "bundled" },
          { name: "knowledge.md", kind: "custom" },
          { name: "overview.md", kind: "bundled" },
        ]
      );
      assert.equal(
        exported.sources[1].sha256,
        hash(Buffer.from(override, "utf8"))
      );
      assert.equal(exported.sha256, hash(exported.prompt));
      const missing = jsonPrompt(node, [
        "--prompts",
        join(cwd, "no overrides here"),
      ]);
      assert.equal(missing.exported.prompt, jsonPrompt(node).exported.prompt);
    }
  );

  await t.test(
    "ignores implicit home overrides and never fetches or launches subprocesses",
    () => {
      const homePrompts = join(root, ".topsignal", "prompts");
      mkdirSync(homePrompts, { recursive: true });
      for (const name of ["common.md", "knowledge.md", "overview.md"]) {
        writeFileSync(
          join(homePrompts, name),
          "DO-NOT-USE-IMPLICIT-HOME-PROMPTS"
        );
      }
      const result = jsonPrompt(node).exported;
      assert.doesNotMatch(
        result.prompt,
        /DO-NOT-USE-IMPLICIT-HOME-PROMPTS|unused-openai|unused-anthropic|unused-github/
      );
      assert.equal(existsSync(marker), false);
    }
  );

  await t.test(
    "writes exactly the selected format to output with empty stdout",
    () => {
      for (const json of [false, true]) {
        const expected = node([
          "analysis-prompt",
          "overview",
          ...(json ? ["--json"] : []),
        ]);
        const output = join(
          cwd,
          json ? "prompt export.json" : "prompt export.md"
        );
        const result = node([
          "analysis-prompt",
          "overview",
          ...(json ? ["--json"] : []),
          "--output",
          output,
        ]);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, "");
        assert.equal(result.stderr, "");
        assert.equal(readFileSync(output, "utf8"), expected.stdout);
      }
    }
  );

  await t.test(
    "reports invalid sections and malformed override Markdown without writing output",
    () => {
      const output = join(cwd, "invalid prompt output.md");
      const invalidSection = node([
        "analysis-prompt",
        "../knowledge",
        "--output",
        output,
      ]);
      assert.equal(invalidSection.status, 1);
      assert.match(
        invalidSection.stderr,
        /section.*all, knowledge, or overview/
      );
      assert.equal(invalidSection.stdout, "");
      assert.equal(existsSync(output), false);
      const custom = join(cwd, "invalid overrides");
      mkdirSync(custom);
      for (const content of [" \n", Buffer.from([0xc3, 0x28]), "text\0text"]) {
        writeFileSync(join(custom, "knowledge.md"), content);
        const result = node([
          "analysis-prompt",
          "knowledge",
          "--prompts",
          custom,
          "--output",
          output,
        ]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Invalid.*custom.*knowledge\.md/);
        assert.equal(result.stdout, "");
        assert.equal(existsSync(output), false);
      }
    }
  );

  await t.test(
    "identifies missing bundled assets, including non-overridable common safeguards",
    () => {
      const common = join(packageRoot, "prompts", "common.md");
      const missing = common + ".missing";
      renameSync(common, missing);
      try {
        const result = node(["analysis-prompt", "knowledge"]);
        assert.equal(result.status, 1);
        assert.match(
          result.stderr,
          /Missing bundled prompt asset common\.md.*Reinstall TopSignal/
        );
        assert.equal(result.stdout, "");
      } finally {
        renameSync(missing, common);
      }
      assert.equal(existsSync(marker), false);
    }
  );
});
