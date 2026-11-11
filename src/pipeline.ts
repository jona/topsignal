import type { Wave1Data, Wave2Data, DeveloperProfile } from "./types.js";
import {
  buildLanguageStats,
  buildSuperlatives,
  buildProfilePayload,
} from "./transforms.js";

export interface PipelineOptions {
  wave1: Wave1Data;
  wave2: Wave2Data;
}

/** Build deterministic profile data. The calling harness owns all analysis. */
export async function runPipeline({
  wave1,
  wave2,
}: PipelineOptions): Promise<DeveloperProfile> {
  const languageStats = buildLanguageStats(wave1.repos, wave1.repoLanguageMap);
  const superlatives = buildSuperlatives(
    wave1.repos.filter((repo) => !repo.fork),
    languageStats
  );
  return {
    ...buildProfilePayload(wave1, wave2, languageStats, superlatives),
    analyzedAt: new Date().toISOString(),
  };
}
