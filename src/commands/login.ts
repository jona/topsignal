import chalk from "chalk";
import ora from "ora";
import { getGhUsername } from "../github/auth.js";
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
  try {
    const username = (await getGhUsername(token.access_token)).toLowerCase();
    saveAuth({ access_token: token.access_token, username });
    spinner.succeed(chalk.white(`Logged in as ${chalk.bold(username)}`));
  } catch (error) {
    spinner.fail(chalk.red("Could not save your GitHub login"));
    throw error;
  }
}
