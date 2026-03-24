import { resolve } from "node:path";
import { scanForRepos } from "../local/scanner.js";

export interface ScanReposOptions {
  depth?: number;
}

export function scanRepos(dir: string | undefined, opts: ScanReposOptions) {
  const rootDir = resolve(dir ?? ".");
  const depth = opts.depth ?? 3;

  process.stderr.write(`Scanning ${rootDir} (depth: ${depth})...\n`);

  const repos = scanForRepos(rootDir, depth);

  process.stderr.write(`  Found ${repos.length} repositories\n`);

  process.stdout.write(JSON.stringify(repos, null, 2) + "\n");
}
