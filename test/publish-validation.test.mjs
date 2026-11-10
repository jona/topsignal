import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("publish refuses invalid profiles and mismatched ownership before fetch", async (t) => {
  const home = mkdtempSync(join(os.tmpdir(), "topsignal-publish-validation-"));
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    rmSync(home, { recursive: true, force: true });
  });
  t.mock.method(os, "homedir", () => home);
  syncBuiltinESMExports();
  const { publish } = await import("../dist/commands/publish.js");
  const authDir = join(home, ".topsignal");
  mkdirSync(authDir, { mode: 0o700 });
  writeFileSync(
    join(authDir, "auth.json"),
    JSON.stringify({ access_token: "fixture-token", username: "owner" }),
    { mode: 0o600 }
  );

  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    Response.json({})
  );
  const profile = join(home, "profile.json");
  writeFileSync(profile, "[]");
  await assert.rejects(
    publish(profile, {}),
    /identity object and a repos array/
  );

  writeFileSync(
    profile,
    JSON.stringify({ identity: { username: "other" }, repos: [] })
  );
  await assert.rejects(publish(profile, {}), /identity must match/);

  writeFileSync(
    profile,
    JSON.stringify({ identity: { username: "owner" }, repos: [] })
  );
  await assert.rejects(
    publish(profile, { username: "other" }),
    /username must match/
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});
