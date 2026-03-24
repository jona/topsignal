import type { CodeBlob, RepoDependencyData } from "./types.js";

const DEP_FIELDS = [
  "packageJson",
  "pyproject",
  "requirements",
  "goMod",
  "cargoToml",
  "gemfile",
  "composerJson",
  "readme",
  "dockerfile",
  "dockerCompose",
  "openapi",
  "securityMd",
  "changelogMd",
] as const;

type DepField = (typeof DEP_FIELDS)[number];

export interface AnalysisStats {
  localRepos: string[];
  remoteRepos: string[];
  blobs: {
    count: number;
    totalChars: number;
    avgChars: number;
    minChars: number;
    maxChars: number;
    largestFile: { repo: string; path: string; chars: number } | null;
    smallestFile: { repo: string; path: string; chars: number } | null;
    byLanguage: Array<{ language: string; count: number }>;
    byRepo: Array<{ repo: string; count: number }>;
  };
  prompt: {
    totalInputChars: number;
    estimatedTokens: number;
  };
}

export function computeStats(
  blobs: CodeBlob[],
  depFiles: RepoDependencyData[],
  localRepos: string[] = [],
  remoteRepos: string[] = []
): AnalysisStats {
  const count = blobs.length;
  const sizes = blobs.map((b) => b.content.length);
  const totalChars = sizes.reduce((s, n) => s + n, 0);
  const avgChars = count > 0 ? Math.round(totalChars / count) : 0;
  const minChars = count > 0 ? Math.min(...sizes) : 0;
  const maxChars = count > 0 ? Math.max(...sizes) : 0;

  const minIdx = count > 0 ? sizes.indexOf(minChars) : -1;
  const maxIdx = count > 0 ? sizes.indexOf(maxChars) : -1;
  const smallestFile =
    minIdx >= 0
      ? { repo: blobs[minIdx].repoName, path: blobs[minIdx].path, chars: minChars }
      : null;
  const largestFile =
    maxIdx >= 0
      ? { repo: blobs[maxIdx].repoName, path: blobs[maxIdx].path, chars: maxChars }
      : null;

  const langMap = new Map<string, number>();
  for (const b of blobs)
    langMap.set(b.language, (langMap.get(b.language) ?? 0) + 1);
  const byLanguage = [...langMap.entries()]
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count);

  const repoMap = new Map<string, number>();
  for (const b of blobs)
    repoMap.set(b.repoName, (repoMap.get(b.repoName) ?? 0) + 1);
  const byRepo = [...repoMap.entries()]
    .map(([repo, count]) => ({ repo, count }))
    .sort((a, b) => b.count - a.count);

  let depTotalChars = 0;
  for (const dep of depFiles) {
    for (const field of DEP_FIELDS) {
      const val = dep[field as DepField];
      if (val) depTotalChars += val.length;
    }
  }

  const totalInputChars = totalChars + depTotalChars;
  const estimatedTokens = Math.round(totalInputChars / 4);

  return {
    localRepos,
    remoteRepos,
    blobs: {
      count,
      totalChars,
      avgChars,
      minChars,
      maxChars,
      largestFile,
      smallestFile,
      byLanguage,
      byRepo,
    },
    prompt: {
      totalInputChars,
      estimatedTokens,
    },
  };
}
