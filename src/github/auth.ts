import { execSync } from "node:child_process";
import { githubREST } from "./graphql.js";
import { getEnv } from "../env.js";

export function getGhToken(): string {
  // 1. Check env var first (works everywhere)
  const envToken = getEnv("GITHUB_TOKEN");
  if (envToken) return envToken;

  // 2. Try gh CLI
  try {
    const token = execSync("gh auth token", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (token) return token;
  } catch {
    // fall through
  }

  throw new Error(
    "Could not get GitHub token. Either:\n" +
      "  - Set GITHUB_TOKEN environment variable, or\n" +
      "  - Install and authenticate the GitHub CLI: brew install gh && gh auth login"
  );
}

export async function getGhUsername(token: string): Promise<string> {
  // 1. Try gh CLI (fast, no network call)
  try {
    const result = execSync("gh api user --jq .login", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (result) return result;
  } catch {
    // fall through
  }

  // 2. Fall back to API call with token
  const user = await githubREST<{ login: string }>(token, "/user");
  if (user.login) return user.login;

  throw new Error(
    "Could not determine GitHub username. Pass it explicitly as an argument."
  );
}
