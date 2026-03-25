import chalk from "chalk";
import ora from "ora";
import { clearAuth, loadAuth } from "../github/device-flow.js";

export function logout() {
  const existing = loadAuth();
  if (!existing) {
    console.error(chalk.yellow("Not logged in."));
    return;
  }

  clearAuth();
  ora({ stream: process.stderr }).succeed(
    chalk.white(`Logged out (was ${chalk.bold(existing.username)})`)
  );
}
