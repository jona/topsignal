import {
  existsSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

function outputPath(file: string): string {
  const absolute = resolve(file);
  return join(realpathSync(dirname(absolute)), basename(absolute));
}

export function checkEvidenceDestination(
  evidence: string,
  profile?: string
): void {
  const evidencePath = outputPath(evidence);
  const info = existsSync(evidencePath) ? lstatSync(evidencePath) : undefined;
  // lstat also sees dangling symlinks, which existsSync does not.
  try {
    if (lstatSync(evidencePath).isSymbolicLink())
      throw new Error("Evidence destination cannot be a symlink.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (info && !info.isFile())
    throw new Error("Evidence destination must be a regular file.");
  if (!profile) return;
  const profilePath = outputPath(profile);
  try {
    if (lstatSync(profilePath).isSymbolicLink()) {
      throw new Error("Profile destination cannot be a symlink.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const other = existsSync(profilePath)
    ? lstatSync(realpathSync(profilePath))
    : undefined;
  if (
    evidencePath === profilePath ||
    (info && other && info.dev === other.dev && info.ino === other.ino)
  ) {
    throw new Error("Profile and evidence must be written to different files.");
  }
}

/** Replace the private artifact atomically, including its restrictive mode. */
export function writeEvidence(file: string, json: string): void {
  const destination = outputPath(file);
  const temporary = mkdtempSync(join(dirname(destination), ".topsignal-"));
  try {
    const pending = join(temporary, "evidence.json");
    writeFileSync(pending, json, { mode: 0o600, flag: "wx" });
    renameSync(pending, destination);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
