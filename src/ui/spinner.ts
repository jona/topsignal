import chalk from "chalk";
import ora from "ora";

export async function withSpinner<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const spinner = ora({ text: chalk.dim(label), stream: process.stderr }).start();
  try {
    const result = await fn();
    spinner.succeed(chalk.white(label));
    return result;
  } catch (err) {
    spinner.fail(chalk.red(label));
    throw err;
  }
}
