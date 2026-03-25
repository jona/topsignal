import { readFileSync } from "node:fs";
import chalk from "chalk";
import ora from "ora";
import { PUBLISH_ENDPOINT } from "../env.js";
import { getGhToken, getGhUsername } from "../github/auth.js";
import { withSpinner } from "../ui/spinner.js";

export interface PublishOptions {
  username?: string;
}

export async function publish(file: string, opts: PublishOptions) {
  const token = getGhToken();
  const username = opts.username ?? (await getGhUsername(token));

  const raw = await withSpinner(`Reading ${file}`, async () => {
    const content = readFileSync(file, "utf-8");
    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new Error(`Invalid JSON in ${file}`);
    }
  });

  const result = await withSpinner(`Publishing as ${username}`, async () => {
    const res = await fetch(PUBLISH_ENDPOINT, {
      method: "POST",
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
