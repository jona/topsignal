import { execFileSync } from "node:child_process";
import { githubREST } from "./graphql.js";
import { getEnv } from "../env.js";
import { loadAuth } from "./device-flow.js";

export function getGhToken(): string {
  const saved = loadAuth();
  if (saved) return saved.access_token;

  const envToken = getEnv("GITHUB_TOKEN")?.trim();
  if (envToken) return envToken;

  try {
    const token = execFileSync(
      "gh",
      ["auth", "token", "--hostname", "github.com"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
    if (token) return token;
  } catch {
    // fall through
  }

  throw new Error(
    "Could not get GitHub token. Either:\n" +
      "  - Run topsignal login, or\n" +
      "  - Set GITHUB_TOKEN environment variable, or\n" +
      "  - Install and authenticate the GitHub CLI: brew install gh && gh auth login"
  );
}

export async function getGhUsername(token: string): Promise<string> {
  const user = await githubREST<{ login?: unknown } | null>(token, "/user");
  if (typeof user?.login === "string" && user.login.trim()) return user.login;

  throw new Error(
    "Could not determine GitHub username. Pass it explicitly as an argument."
  );
}
