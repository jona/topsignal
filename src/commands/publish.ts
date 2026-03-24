import { readFileSync } from "node:fs";
import { PUBLISH_ENDPOINT } from "../env.js";
import { getGhToken, getGhUsername } from "../github/auth.js";

export interface PublishOptions {
  username?: string;
}

export async function publish(file: string, opts: PublishOptions) {
  const log = (msg: string) => process.stderr.write(`${msg}\n`);

  const token = getGhToken();
  const username = opts.username ?? (await getGhUsername(token));

  log(`Reading ${file}...`);
  const raw = readFileSync(file, "utf-8");

  let profile: unknown;
  try {
    profile = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${file}`);
  }

  log(`Publishing as ${username} to ${PUBLISH_ENDPOINT}...`);

  const res = await fetch(PUBLISH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ profile, username }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Publish failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const result = await res.json().catch(() => ({}));
  log("Published successfully");
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
