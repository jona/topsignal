import { githubGraphQL } from "../graphql.js";
import type { GithubRepo, CodeBlob } from "../../types.js";

const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "py",
  "go",
  "rs",
  "java",
  "cpp",
  "c",
  "cs",
  "rb",
  "swift",
  "kt",
  "scala",
  "ex",
  "exs",
  "zig",
  "nim",
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
  // Sensitive files — never fetch or send to LLM
  /\.env/i,
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
  /auth\.json$/i,
  /\.netrc$/i,
  /service.account/i,
  /\.npmrc$/i,
  /\.pypirc$/i,
];

const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  py: "Python",
  go: "Go",
  rs: "Rust",
  java: "Java",
  cpp: "C++",
  c: "C",
  cs: "C#",
  rb: "Ruby",
  swift: "Swift",
  kt: "Kotlin",
  scala: "Scala",
  ex: "Elixir",
  exs: "Elixir",
  zig: "Zig",
  nim: "Nim",
};

function isInterestingFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!CODE_EXTENSIONS.has(ext)) return false;
  if (EXCLUDE_PATTERNS.some((p) => p.test(name))) return false;
  return true;
}

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

export async function fetchCodeBlobs(
  token: string,
  username: string,
  repos: GithubRepo[],
  repoLimit: number,
  filesPerRepo: number
): Promise<CodeBlob[]> {
  const targets = [...repos]
    .filter((r) => !r.fork)
    .sort((a, b) => b.size - a.size)
    .slice(0, repoLimit);

  if (targets.length === 0) return [];

  // ── Level 0: fetch root tree for each repo ───────────────────────────────
  const rootFragments = targets
    .map((r, i) => {
      const safeName = r.name.replace(/[^a-zA-Z0-9_.-]/g, "");
      return `
      r${i}: repository(owner: "${username}", name: "${safeName}") {
        root: object(expression: "HEAD:") { ... on Tree { entries { name type } } }
      }`;
    })
    .join("\n");

  const rootResult = await githubGraphQL<
    Record<string, { root: { entries?: { name: string; type: string }[] } | null }>
  >(token, `query CodeTrees {\n${rootFragments}\n}`, {}).catch(
    () => ({}) as Record<string, never>
  );

  const NOISY_DIRS = new Set([
    "node_modules", ".git", "dist", "build", "out", "target", "vendor",
    ".next", ".nuxt", "__pycache__", ".venv", "venv", "env", "coverage",
    ".cache", ".idea", ".vscode", "tmp", "temp", ".turbo", ".parcel-cache",
  ]);

  // candidatesPerRepo[i] accumulates {path, score} across all tree levels
  const candidatesPerRepo: { path: string; score: number }[][] = targets.map(() => []);
  const level1Tasks: { repoIdx: number; path: string }[] = [];

  for (let i = 0; i < targets.length; i++) {
    const repoData = rootResult[`r${i}`];
    if (!repoData?.root?.entries) continue;
    for (const entry of repoData.root.entries) {
      if (entry.type === "blob" && isInterestingFile(entry.name)) {
        candidatesPerRepo[i].push({ path: entry.name, score: scoreFilename(entry.name) });
      } else if (entry.type === "tree" && !NOISY_DIRS.has(entry.name)) {
        level1Tasks.push({ repoIdx: i, path: entry.name });
      }
    }
  }

  // ── Level 1: drill into all root directories ──────────────────────────────
  if (level1Tasks.length > 0) {
    const level1Fragments = level1Tasks
      .map((t, j) => {
        const safeName = targets[t.repoIdx].name.replace(/[^a-zA-Z0-9_.-]/g, "");
        return `
      d${j}: repository(owner: "${username}", name: "${safeName}") {
        tree: object(expression: "HEAD:${t.path}") { ... on Tree { entries { name type } } }
      }`;
      })
      .join("\n");

    const level1Result = await githubGraphQL<
      Record<string, { tree: { entries?: { name: string; type: string }[] } | null }>
    >(token, `query CodeTreesL1 {\n${level1Fragments}\n}`, {}).catch(
      () => ({}) as Record<string, never>
    );

    const level2Tasks: { repoIdx: number; path: string }[] = [];

    for (let j = 0; j < level1Tasks.length; j++) {
      const { repoIdx, path: dirPath } = level1Tasks[j];
      const treeData = level1Result[`d${j}`];
      if (!treeData?.tree?.entries) continue;
      for (const entry of treeData.tree.entries) {
        if (entry.type === "blob" && isInterestingFile(entry.name)) {
          candidatesPerRepo[repoIdx].push({
            path: `${dirPath}/${entry.name}`,
            score: scoreFilename(entry.name),
          });
        } else if (entry.type === "tree" && !NOISY_DIRS.has(entry.name)) {
          level2Tasks.push({ repoIdx, path: `${dirPath}/${entry.name}` });
        }
      }
    }

    // ── Level 2: recurse into subdirs of root dirs ────────────────────────
    if (level2Tasks.length > 0) {
      const level2Fragments = level2Tasks
        .map((t, j) => {
          const safeName = targets[t.repoIdx].name.replace(/[^a-zA-Z0-9_.-]/g, "");
          return `
      e${j}: repository(owner: "${username}", name: "${safeName}") {
        tree: object(expression: "HEAD:${t.path}") { ... on Tree { entries { name type } } }
      }`;
        })
        .join("\n");

      const level2Result = await githubGraphQL<
        Record<string, { tree: { entries?: { name: string; type: string }[] } | null }>
      >(token, `query CodeTreesL2 {\n${level2Fragments}\n}`, {}).catch(
        () => ({}) as Record<string, never>
      );

      for (let j = 0; j < level2Tasks.length; j++) {
        const { repoIdx, path: dirPath } = level2Tasks[j];
        const treeData = level2Result[`e${j}`];
        if (!treeData?.tree?.entries) continue;
        for (const entry of treeData.tree.entries) {
          if (entry.type === "blob" && isInterestingFile(entry.name)) {
            candidatesPerRepo[repoIdx].push({
              path: `${dirPath}/${entry.name}`,
              score: scoreFilename(entry.name),
            });
          }
        }
      }
    }
  }

  // ── Pick top files per repo ───────────────────────────────────────────────
  const toFetch: { repo: GithubRepo; path: string }[] = [];

  for (let i = 0; i < targets.length; i++) {
    const candidates = candidatesPerRepo[i];
    candidates.sort((a, b) => b.score - a.score);
    for (const c of candidates.slice(0, filesPerRepo)) {
      toFetch.push({ repo: targets[i], path: c.path });
    }
  }

  if (toFetch.length === 0) return [];

  const blobFragments = toFetch
    .map((f, i) => {
      const safeName = f.repo.name.replace(/[^a-zA-Z0-9_.-]/g, "");
      return `
      b${i}: repository(owner: "${username}", name: "${safeName}") {
        blob: object(expression: "HEAD:${f.path}") { ... on Blob { text byteSize } }
      }`;
    })
    .join("\n");

  const blobResult = await githubGraphQL<
    Record<string, { blob: { text: string; byteSize: number } | null }>
  >(token, `query FetchBlobs {\n${blobFragments}\n}`, {}).catch(
    () => ({}) as Record<string, never>
  );

  const blobs: CodeBlob[] = [];
  for (let i = 0; i < toFetch.length; i++) {
    const data = blobResult[`b${i}`];
    if (!data?.blob?.text) continue;
    if (data.blob.byteSize > 80_000) continue;
    const ext = toFetch[i].path.split(".").pop()?.toLowerCase() ?? "";
    blobs.push({
      repoName: toFetch[i].repo.name,
      path: toFetch[i].path,
      language: EXT_TO_LANGUAGE[ext] ?? ext.toUpperCase(),
      content: data.blob.text,
    });
  }

  return blobs;
}
