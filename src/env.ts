import { join } from "node:path";
import { homedir } from "node:os";

// ─── Package ────────────────────────────────────────────────────────────────

export const VERSION = "0.1.3";
export const USER_AGENT = `topsignal-cli/${VERSION}`;

// ─── URLs ───────────────────────────────────────────────────────────────────

export const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
export const GITHUB_REST_URL = "https://api.github.com";
export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
export const PUBLISH_ENDPOINT =
  process.env.TOPSIGNAL_PUBLISH_URL ?? "https://api.topsignal.dev/publish";

// ─── LLM defaults ──────────────────────────────────────────────────────────

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
export const DEFAULT_OPENAI_MODEL = "gpt-4o";
export const DEFAULT_MAX_TOKENS = 16384;

// ─── Paths ──────────────────────────────────────────────────────────────────

export const DEFAULT_PROMPTS_DIR = join(homedir(), ".topsignal", "prompts");

// ─── Env vars ───────────────────────────────────────────────────────────────

export const ANTHROPIC_API_KEY = "ANTHROPIC_API_KEY";
export const OPENAI_API_KEY = "OPENAI_API_KEY";

export function getEnv(key: string): string | undefined {
  return process.env[key];
}
