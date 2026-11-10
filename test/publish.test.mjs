import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
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

  const { publish } = await import("../dist/commands/publish.js");
  const { AUTH_TOKEN_PATH } = await import("../dist/env.js");
  const profileFile = "profile-fixture.json";
  const username = "test-user";
  const token = "test-token";
  const profile = { identity: { username } };
  const originalReadFile = fs.readFileSync;

  t.mock.method(fs, "readFileSync", (file, ...args) => {
    if (file === AUTH_TOKEN_PATH) {
      return JSON.stringify({ access_token: token, username });
    }
    if (file === profileFile) return JSON.stringify(profile);
    return originalReadFile(file, ...args);
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });

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
