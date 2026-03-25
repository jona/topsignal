import chalk from "chalk";
import ora from "ora";
import { GITHUB_REST_URL, USER_AGENT } from "../env.js";
import {
  requestDeviceCode,
  pollForToken,
  saveAuth,
  loadAuth,
} from "../github/device-flow.js";

export async function login() {
  const existing = loadAuth();
  if (existing) {
    console.error(
      chalk.yellow(
        `Already logged in as ${chalk.bold(existing.username)}. Run ${chalk.cyan("topsignal logout")} first to switch accounts.`
      )
    );
    return;
  }

  const spinner = ora({ stream: process.stderr });

  spinner.start(chalk.dim("Requesting device code..."));
  const device = await requestDeviceCode();
  spinner.stop();

  console.error();
  console.error(
    chalk.white("  Open ") +
      chalk.cyan.underline(device.verification_uri) +
      chalk.white(" and enter code:")
  );
  console.error();
  console.error("  " + chalk.bold.yellow(device.user_code));
  console.error();

  spinner.start(chalk.dim("Waiting for authorization..."));
  const token = await pollForToken(
    device.device_code,
    device.interval,
    device.expires_in
  );

  spinner.text = chalk.dim("Verifying...");
  const userRes = await fetch(`${GITHUB_REST_URL}/user`, {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "User-Agent": USER_AGENT,
      Accept: "application/vnd.github+json",
    },
  });

  if (!userRes.ok) {
    spinner.fail(chalk.red("Failed to verify token"));
    throw new Error("Token verification failed");
  }

  const user = (await userRes.json()) as { login: string };
  const username = user.login.toLowerCase();

  saveAuth({ access_token: token.access_token, username });
  spinner.succeed(chalk.white(`Logged in as ${chalk.bold(username)}`));
}
