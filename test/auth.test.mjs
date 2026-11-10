import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import { dirname, join } from "node:path";
import { after, mock, test } from "node:test";

const homeDirectory = fs.mkdtempSync(join(os.tmpdir(), "topsignal-auth-"));
after(() => fs.rmSync(homeDirectory, { recursive: true, force: true }));
const mockHome = mock.method(os, "homedir", () => homeDirectory);
syncBuiltinESMExports();
const { AUTH_TOKEN_PATH } = await import("../dist/env.js");
const { getGhToken, getGhUsername } = await import("../dist/github/auth.js");
const { clearAuth, loadAuth, saveAuth } =
  await import("../dist/github/device-flow.js");
const { logout } = await import("../dist/commands/logout.js");
mockHome.mock.restore();
syncBuiltinESMExports();

const authDirectory = dirname(AUTH_TOKEN_PATH);
const stored = { access_token: "saved-demo-token", username: "demo-login" };

test("selects saved login, then environment, then gh, and looks up the selected token", async (t) => {
  process.env.GITHUB_TOKEN = "environment-demo-token";
  t.after(() => {
    delete process.env.GITHUB_TOKEN;
    fs.rmSync(authDirectory, { recursive: true, force: true });
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const gh = t.mock.method(childProcess, "execFileSync", (file, args) => {
    assert.equal(file, "gh");
    assert.deepEqual(args, ["auth", "token", "--hostname", "github.com"]);
    return "cli-demo-token\n";
  });
  syncBuiltinESMExports();
  const request = t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://api.github.com/user");
    assert.equal(init.headers.Authorization, "Bearer saved-demo-token");
    return Response.json({ login: "resolved-demo-login" });
  });

  saveAuth(stored);
  const token = getGhToken();
  assert.equal(token, stored.access_token);
  assert.equal(await getGhUsername(token), "resolved-demo-login");
  assert.equal(request.mock.callCount(), 1);
  assert.equal(gh.mock.callCount(), 0);

  assert.equal(clearAuth(), true);
  assert.equal(getGhToken(), "environment-demo-token");
  assert.equal(gh.mock.callCount(), 0);
  delete process.env.GITHUB_TOKEN;
  assert.equal(getGhToken(), "cli-demo-token");
  assert.equal(gh.mock.callCount(), 1);
});

test(
  "stores credentials privately and tightens a legacy auth file on read",
  {
    skip: process.getuid === undefined,
  },
  (t) => {
    t.after(() => fs.rmSync(authDirectory, { recursive: true, force: true }));
    saveAuth(stored);
    assert.equal(fs.statSync(authDirectory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(AUTH_TOKEN_PATH).mode & 0o777, 0o600);
    fs.chmodSync(AUTH_TOKEN_PATH, 0o644);
    assert.deepEqual(loadAuth(), stored);
    assert.equal(fs.statSync(AUTH_TOKEN_PATH).mode & 0o777, 0o600);

    const before = fs.statSync(AUTH_TOKEN_PATH);
    saveAuth({ ...stored, access_token: "replacement-demo-token" });
    const after = fs.statSync(AUTH_TOKEN_PATH);
    assert.notEqual(after.ino, before.ino);
    assert.equal(after.mode & 0o777, 0o600);
    assert.equal(loadAuth().access_token, "replacement-demo-token");
  }
);

test("logout removes an invalid saved record and propagates unlink failures", (t) => {
  t.after(() => fs.rmSync(authDirectory, { recursive: true, force: true }));
  fs.mkdirSync(authDirectory, { mode: 0o700 });
  fs.writeFileSync(AUTH_TOKEN_PATH, "{", { mode: 0o600 });
  assert.throws(loadAuth, /saved TopSignal credentials are invalid/i);
  logout();
  assert.equal(loadAuth(), null);
  assert.equal(clearAuth(), false);

  fs.mkdirSync(AUTH_TOKEN_PATH);
  assert.throws(logout, (error) => ["EISDIR", "EPERM"].includes(error.code));
  assert.equal(fs.statSync(AUTH_TOKEN_PATH).isDirectory(), true);
});

test(
  "auth reads reject symlinks, while logout removes only the link",
  {
    skip: process.platform === "win32",
  },
  (t) => {
    t.after(() => fs.rmSync(authDirectory, { recursive: true, force: true }));
    fs.mkdirSync(authDirectory, { mode: 0o700 });
    const otherFile = join(homeDirectory, "fixture.json");
    fs.writeFileSync(otherFile, JSON.stringify(stored), { mode: 0o600 });
    fs.symlinkSync(otherFile, AUTH_TOKEN_PATH);
    assert.throws(loadAuth, /saved TopSignal credentials are invalid/i);
    assert.equal(clearAuth(), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(otherFile, "utf-8")), stored);
  }
);
