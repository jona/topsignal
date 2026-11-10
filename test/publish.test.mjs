import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("publish sends credentials and the profile only to the official endpoint", async (t) => {
  const previousEndpoint = process.env.TOPSIGNAL_PUBLISH_URL;
  process.env.TOPSIGNAL_PUBLISH_URL = "https://example.invalid/publish";
  t.after(() => {
    if (previousEndpoint === undefined) {
      delete process.env.TOPSIGNAL_PUBLISH_URL;
    } else {
      process.env.TOPSIGNAL_PUBLISH_URL = previousEndpoint;
    }
  });

  const homeDirectory = fs.mkdtempSync(join(os.tmpdir(), "topsignal-publish-"));
  t.after(() => fs.rmSync(homeDirectory, { recursive: true, force: true }));
  const mockHome = t.mock.method(os, "homedir", () => homeDirectory);
  syncBuiltinESMExports();
  const { publish } = await import("../dist/commands/publish.js");
  const { saveAuth } = await import("../dist/github/device-flow.js");
  mockHome.mock.restore();
  syncBuiltinESMExports();

  const profileFile = join(homeDirectory, "profile-fixture.json");
  const username = "test-user";
  const token = "test-token";
  const profile = { identity: { username }, repos: [] };
  saveAuth({ access_token: token, username });
  fs.writeFileSync(profileFile, JSON.stringify(profile));

  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    return Response.json({});
  });

  await publish(profileFile, {});

  assert.equal(fetchMock.mock.callCount(), 1);
  const [url, request] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "https://api.topsignal.dev/publish");
  assert.equal(request.method, "POST");
  assert.equal(request.redirect, "error");
  assert.equal(request.headers.Authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(request.body), { profile, username });
});
