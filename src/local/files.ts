import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import type { RepoDependencyData, CodeBlob } from "../types.js";
import { scanForSecrets, redactSecrets } from "./secrets.js";

// ─── Dependency files ───────────────────────────────────────────────────────

function readFile(path: string, maxBytes?: number): string | null {
  try {
    if (!existsSync(path)) return null;
    const content = readFileSync(path, "utf-8");
    return maxBytes !== undefined ? content.slice(0, maxBytes) : content;
  } catch {
    return null;
  }
}

function dirExists(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function sanitizePackageJson(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    delete obj.author;
    delete obj.contributors;
    delete obj.publishConfig;
    delete obj.bugs;
    return JSON.stringify(obj, null, 2);
  } catch {
    return raw;
  }
}

function sanitizeDockerfile(raw: string | null): string | null {
  if (!raw) return null;
  return raw.replace(
    /^(ARG|ENV)\s+\w*(PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL)\w*\s*=.*/gim,
    "$1 $2=[REDACTED]"
  );
}

function sanitizeDockerCompose(raw: string | null): string | null {
  if (!raw) return null;
  return raw.replace(
    /^(\s*\w*(PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL)\w*\s*:\s*).+$/gim,
    "$1[REDACTED]"
  );
}

export function readDependencyFiles(repoPath: string): RepoDependencyData {
  const repoName = basename(repoPath);
  const r = (file: string, max: number) => readFile(join(repoPath, file), max);

  const openapiText =
    r("openapi.yaml", 4000) ??
    r("openapi.json", 4000) ??
    r("swagger.yaml", 4000);

  return {
    repoName,
    packageJson: sanitizePackageJson(r("package.json", 8000)),
    pyproject: r("pyproject.toml", 4000),
    requirements: r("requirements.txt", 3000),
    goMod: r("go.mod", 3000),
    cargoToml: r("Cargo.toml", 4000),
    gemfile: r("Gemfile", 3000),
    composerJson: r("composer.json", 4000),
    readme: r("README.md", 3000),
    dockerfile: sanitizeDockerfile(r("Dockerfile", 3000)),
    dockerCompose: sanitizeDockerCompose(r("docker-compose.yml", 3000)),
    openapi: openapiText,
    securityMd: r("SECURITY.md", 2000),
    changelogMd: r("CHANGELOG.md", 2000),
    hasTestsDir: dirExists(join(repoPath, "tests")),
    hasTestDir: dirExists(join(repoPath, "test")),
    hasSpecDir: dirExists(join(repoPath, "spec")),
    hasWorkflows: dirExists(join(repoPath, ".github", "workflows")),
    hasProtoDir: dirExists(join(repoPath, "proto")),
    hasDocsDir: dirExists(join(repoPath, "docs")),
  };
}

// ─── Code blobs ─────────────────────────────────────────────────────────────

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cpp",
  ".c",
  ".cs",
  ".rb",
  ".swift",
  ".kt",
  ".scala",
  ".ex",
  ".exs",
  ".zig",
  ".nim",
]);

const EXCLUDE_PATTERNS = [
  /\.min\./i,
  /\.generated\./i,
  /\.d\.ts$/,
  /\.config\./i,
  /\.spec\./i,
  /\.test\./i,
  /__tests__/i,
  /fixtures/i,
  /migrations/i,
  /vendor/i,
  /node_modules/i,
  /\.next/i,
  /dist/i,
  /build/i,
  /\.git/i,
  // Sensitive files — never read or send to LLM
  /\.env/i,
  /\.env\./i,
  /credentials/i,
  /secrets?\./i,
  /\.pem$/i,
  /\.key$/i,
  /\.cert$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.keystore$/i,
  /\.jks$/i,
  /\.htpasswd$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /id_ecdsa/i,
  /[\\/.]token[\\/.]|[\\/.]token$/i,
  /\.npmrc$/i,
  /\.pypirc$/i,
  /application\.ya?ml$/i,
  /application\.properties$/i,
  /local_settings\.py$/i,
  /auth\.json$/i,
  /\.netrc$/i,
  /service.account/i,
  /gcloud/i,
];

const EXT_TO_LANGUAGE: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".cpp": "C++",
  ".c": "C",
  ".cs": "C#",
  ".rb": "Ruby",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".scala": "Scala",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".zig": "Zig",
  ".nim": "Nim",
};

function scoreFilename(name: string): number {
  let score = 0;
  if (
    /algo|algorithm|tree|graph|heap|sort|search|dp|dynamic|pars|compil|lex|ast|hash|cache|queue|stack|buffer|scheduler|engine/i.test(
      name
    )
  )
    score += 10;
  if (/impl|core|service|handler|manager|processor|worker/i.test(name))
    score += 4;
  if (/index|main|app|server|cli|entry|init/i.test(name)) score -= 3;
  if (
    /test|spec|mock|fixture|helper|util|types|interface|schema|model/i.test(
      name
    )
  )
    score -= 5;
  return score;
}

function collectSourceFiles(
  dir: string,
  repoRoot: string,
  depth: number,
  maxDepth: number,
  results: { relativePath: string; score: number }[]
) {
  if (depth > maxDepth) return;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    const relativePath = full.slice(repoRoot.length + 1);

    if (EXCLUDE_PATTERNS.some((p) => p.test(relativePath))) continue;

    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (!entry.startsWith(".")) {
          collectSourceFiles(full, repoRoot, depth + 1, maxDepth, results);
        }
      } else if (stat.isFile()) {
        const ext = extname(entry).toLowerCase();
        if (CODE_EXTENSIONS.has(ext) && stat.size > 100 && stat.size < 80_000) {
          results.push({
            relativePath,
            score: scoreFilename(entry),
          });
        }
      }
    } catch {
      // skip
    }
  }
}

export function readCodeBlobs(
  repoPath: string,
  maxBlobs: number = 15
): CodeBlob[] {
  const repoName = basename(repoPath);
  const candidates: { relativePath: string; score: number }[] = [];

  // Prioritize source directories
  const sourceDirs = ["src", "lib", "core", "pkg", "internal", "cmd"];
  for (const dir of sourceDirs) {
    const full = join(repoPath, dir);
    if (dirExists(full)) {
      collectSourceFiles(full, repoPath, 0, 4, candidates);
    }
  }

  // Also check root level files
  collectSourceFiles(repoPath, repoPath, 0, 1, candidates);

  candidates.sort((a, b) => b.score - a.score);

  const blobs: CodeBlob[] = [];
  for (const candidate of candidates.slice(0, maxBlobs)) {
    const content = readFile(join(repoPath, candidate.relativePath));
    if (!content) continue;

    const secrets = scanForSecrets(content);
    const safeContent = secrets.length > 0 ? redactSecrets(content) : content;

    const ext = extname(candidate.relativePath).toLowerCase();
    blobs.push({
      repoName,
      path: candidate.relativePath,
      language: EXT_TO_LANGUAGE[ext] ?? ext.slice(1).toUpperCase(),
      content: safeContent,
    });
  }

  return blobs;
}
