import { readFileSync } from "node:fs";
import chalk from "chalk";
import ora from "ora";
import { PUBLISH_ENDPOINT } from "../env.js";
import { loadAuth } from "../github/device-flow.js";
import { withSpinner } from "../ui/spinner.js";

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
  const username = opts.username ?? auth.username;

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
