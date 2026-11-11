import { join } from "node:path";
import { homedir } from "node:os";

// ─── Package ────────────────────────────────────────────────────────────────

export const VERSION = "0.3.0";
export const USER_AGENT = `topsignal-cli/${VERSION}`;

// ─── URLs ───────────────────────────────────────────────────────────────────

export const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
export const GITHUB_REST_URL = "https://api.github.com";
export const PUBLISH_ENDPOINT = "https://api.topsignal.dev/publish";

// ─── GitHub OAuth ───────────────────────────────────────────────────────────

export const GITHUB_CLIENT_ID = "Ov23lirRfn65fs2HQlgP";
export const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
export const GITHUB_ACCESS_TOKEN_URL =
  "https://github.com/login/oauth/access_token";
export const GITHUB_DEVICE_SCOPE = "";

// ─── Paths ──────────────────────────────────────────────────────────────────

export const AUTH_TOKEN_PATH = join(homedir(), ".topsignal", "auth.json");

// ─── Env vars ───────────────────────────────────────────────────────────────

export function getEnv(key: string): string | undefined {
  return process.env[key];
}
