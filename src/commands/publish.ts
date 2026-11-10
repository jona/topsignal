import { readFileSync } from "node:fs";
import chalk from "chalk";
import ora from "ora";
import { PUBLISH_ENDPOINT } from "../env.js";
import { loadAuth } from "../github/device-flow.js";
import { withSpinner } from "../ui/spinner.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export interface PublishOptions {
  username?: string;
}

export async function publish(file: string, opts: PublishOptions) {
  const auth = loadAuth();
  if (!auth) {
    throw new Error(
      `Not logged in. Run ${chalk.cyan("topsignal login")} first.`
    );
  }

  const token = auth.access_token;
  const username = auth.username.toLowerCase();
  if (
    opts.username !== undefined &&
    opts.username.trim().toLowerCase() !== username
  ) {
    throw new Error(
      "Publish username must match the logged-in GitHub account."
    );
  }

  const raw = await withSpinner(`Reading ${file}`, async () => {
    const content = readFileSync(file, "utf-8");
    let profile: unknown;
    try {
      profile = JSON.parse(content);
    } catch {
      throw new Error(`Invalid JSON in ${file}`);
    }
    if (
      !isRecord(profile) ||
      !isRecord(profile.identity) ||
      !Array.isArray(profile.repos)
    ) {
      throw new Error(
        "Profile JSON must contain an identity object and a repos array."
      );
    }
    const profileUsername = profile.identity.username;
    if (
      typeof profileUsername !== "string" ||
      profileUsername.trim().toLowerCase() !== username
    ) {
      throw new Error(
        "Profile identity must match the logged-in GitHub account."
      );
    }
    return profile;
  });

  await withSpinner(`Publishing as ${username}`, async () => {
    const res = await fetch(PUBLISH_ENDPOINT, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ profile: raw, username }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Publish failed: ${res.status} ${body.slice(0, 200)}`);
    }

    return res.json().catch(() => ({}));
  });

  const profileUrl = `https://www.topsignal.dev/${username}`;
  ora({ stream: process.stderr }).succeed(
    chalk.white(`Profile URL: ${profileUrl}`)
  );
}
