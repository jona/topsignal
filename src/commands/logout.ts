import chalk from "chalk";
import ora from "ora";
import { clearAuth } from "../github/device-flow.js";

export function logout() {
  if (!clearAuth()) {
    console.error(chalk.yellow("Not logged in."));
    return;
  }

  ora({ stream: process.stderr }).succeed(
    chalk.white("Removed saved TopSignal credentials.")
  );
}
