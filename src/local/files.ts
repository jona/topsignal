import { join, extname, basename, resolve } from "node:path";
import type { RepoDependencyData, CodeBlob } from "../types.js";
import {
  screenOutboundFile,
  screenOutboundPackageJson,
} from "../privacy/outbound.js";
import { canonicalDirectory, readRegularFile, statWithin } from "./paths.js";
import { trackedRegularFiles } from "./worktree.js";

// ─── Dependency files ───────────────────────────────────────────────────────

function worktreePath(repoPath: string, scanRoot?: string): string | null {
  if (scanRoot === undefined) return canonicalDirectory(repoPath);
  const absolute = resolve(repoPath);
  return statWithin(scanRoot, absolute)?.isDirectory() ? absolute : null;
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

export function readDependencyFiles(
  repoPath: string,
  scanRoot?: string
): RepoDependencyData {
  const repoName = basename(repoPath);
  const root = worktreePath(repoPath, scanRoot);
  const files = root ? trackedRegularFiles(root) : new Set<string>();
  const r = (
    file: string,
    max: number,
    sanitize: (text: string | null) => string | null = screenOutboundFile
  ) => {
    if (!root || !files.has(file)) return null;
    const content = readRegularFile(root, join(root, file), 1024 * 1024);
    return sanitize(content)?.slice(0, max) ?? null;
  };
  const hasDir = (dir: string) =>
    !!root &&
    !!statWithin(root, join(root, dir))?.isDirectory() &&
    [...files].some((file) => file.startsWith(`${dir}/`));

  const openapiText =
    r("openapi.yaml", 4000) ??
    r("openapi.json", 4000) ??
    r("swagger.yaml", 4000);

  return {
    repoName,
    packageJson: r("package.json", 8000, screenOutboundPackageJson),
    pyproject: r("pyproject.toml", 4000),
    requirements: r("requirements.txt", 3000),
    goMod: r("go.mod", 3000),
    cargoToml: r("Cargo.toml", 4000),
    gemfile: r("Gemfile", 3000),
    composerJson: r("composer.json", 4000),
    readme: r("README.md", 3000),
    dockerfile: r("Dockerfile", 3000, (text) =>
      sanitizeDockerfile(screenOutboundFile(text))
    ),
    dockerCompose: r("docker-compose.yml", 3000, (text) =>
      sanitizeDockerCompose(screenOutboundFile(text))
    ),
    openapi: openapiText,
    securityMd: r("SECURITY.md", 2000),
    changelogMd: r("CHANGELOG.md", 2000),
    hasTestsDir: hasDir("tests"),
    hasTestDir: hasDir("test"),
    hasSpecDir: hasDir("spec"),
    hasWorkflows: hasDir(".github/workflows"),
    hasProtoDir: hasDir("proto"),
    hasDocsDir: hasDir("docs"),
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

const SOURCE_DIRS = new Set(["src", "lib", "core", "pkg", "internal", "cmd"]);

export function readCodeBlobs(
  repoPath: string,
  maxBlobs: number = 15,
  scanRoot?: string
): CodeBlob[] {
  const root = worktreePath(repoPath, scanRoot);
  if (!root || !Number.isSafeInteger(maxBlobs) || maxBlobs < 1) return [];
  const repoName = basename(repoPath);
  const candidates: {
    path: string;
    ext: string;
    score: number;
    isSourceDir: boolean;
  }[] = [];
  for (const path of trackedRegularFiles(root)) {
    const parts = path.split("/");
    const filename = parts[parts.length - 1];
    const ext = extname(filename).toLowerCase();
    const isSourceDir = parts.length > 1 && SOURCE_DIRS.has(parts[0]);
    if (parts.length > (isSourceDir ? 6 : 2)) continue;
    if (parts.slice(0, -1).some((dir) => dir.startsWith("."))) continue;
    if (!CODE_EXTENSIONS.has(ext) || EXCLUDE_PATTERNS.some((p) => p.test(path)))
      continue;
    candidates.push({ path, ext, score: scoreFilename(filename), isSourceDir });
  }
  candidates.sort(
    (a, b) => b.score - a.score || Number(b.isSourceDir) - Number(a.isSourceDir)
  );

  const blobs: CodeBlob[] = [];
  for (const { path, ext } of candidates) {
    const content = readRegularFile(root, join(root, path), 79_999);
    if (!content || Buffer.byteLength(content, "utf8") <= 100) continue;
    const safeContent = screenOutboundFile(content);
    if (!safeContent) continue;
    blobs.push({
      repoName,
      path,
      language: EXT_TO_LANGUAGE[ext] ?? ext.slice(1).toUpperCase(),
      content: safeContent,
    });
    if (blobs.length >= maxBlobs) break;
  }

  return blobs;
}
