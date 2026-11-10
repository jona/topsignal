import type { CodeBlob, RepoDependencyData, Wave2Data } from "../types.js";

interface LocalSamples {
  name: string;
  remote: string | null;
  dependencyFiles: RepoDependencyData;
  codeBlobs: CodeBlob[];
}

function githubRepoKey(remote: string | null): string | null {
  if (!remote) return null;
  const scp = /^(?:[^@/:]+@)?github\.com:(.+)$/i.exec(remote);
  let path: string;
  if (scp) {
    path = scp[1];
  } else {
    try {
      const url = new URL(remote);
      const isStandard =
        url.hostname === "github.com" &&
        ((["https:", "http:"].includes(url.protocol) && !url.port) ||
          (url.protocol === "ssh:" && (!url.port || url.port === "22")) ||
          (url.protocol === "git:" && (!url.port || url.port === "9418")));
      const isAlternateSSH =
        url.protocol === "ssh:" &&
        url.hostname === "ssh.github.com" &&
        url.port === "443";
      if (!isStandard && !isAlternateSSH) return null;
      path = url.pathname.slice(1);
    } catch {
      return null;
    }
  }

  const key = path.replace(/\/$/, "").replace(/\.git$/i, "");
  return /^[a-z0-9-]+\/[a-z0-9_.-]+$/i.test(key) ? key.toLowerCase() : null;
}

function hasDependencyData(deps: RepoDependencyData): boolean {
  return Object.entries(deps).some(
    ([key, value]) => key !== "repoName" && Boolean(value)
  );
}

export function mergeLocalSamples(
  wave2: Pick<Wave2Data, "codeBlobs" | "dependencyFiles">,
  localRepos: LocalSamples[]
): { addedBlobs: number; localRepoNames: string[] } {
  wave2.dependencyFiles = wave2.dependencyFiles.filter(hasDependencyData);
  const codeRepos = new Set(
    wave2.codeBlobs.map((blob) => blob.repoName.toLowerCase())
  );
  const depRepos = new Set(
    wave2.dependencyFiles.map((dep) => dep.repoName.toLowerCase())
  );
  const labels = new Map<string, string>();
  for (const sample of [...wave2.codeBlobs, ...wave2.dependencyFiles]) {
    labels.set(sample.repoName.toLowerCase(), sample.repoName);
  }
  const localRepoNames = new Set<string>();
  let addedBlobs = 0;

  for (const repo of localRepos) {
    const key = githubRepoKey(repo.remote);
    const addCode = repo.codeBlobs.length > 0 && (!key || !codeRepos.has(key));
    const addDeps =
      hasDependencyData(repo.dependencyFiles) && (!key || !depRepos.has(key));
    if (!addCode && !addDeps) continue;

    let label = key ? (labels.get(key) ?? key) : repo.name;
    if (!key) {
      for (let suffix = 2; labels.has(label.toLowerCase()); suffix++) {
        label = `${repo.name} (local ${suffix})`;
      }
    }
    labels.set(label.toLowerCase(), label);
    localRepoNames.add(label);

    if (addCode) {
      wave2.codeBlobs.push(
        ...repo.codeBlobs.map((blob) => ({ ...blob, repoName: label }))
      );
      codeRepos.add(label.toLowerCase());
      addedBlobs += repo.codeBlobs.length;
    }
    if (addDeps) {
      wave2.dependencyFiles.push({ ...repo.dependencyFiles, repoName: label });
      depRepos.add(label.toLowerCase());
    }
  }

  return { addedBlobs, localRepoNames: [...localRepoNames] };
}
