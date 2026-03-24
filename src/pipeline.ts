import type { LLMProvider } from "./llm/provider.js";
import type { Wave1Data, Wave2Data, DeveloperProfile } from "./types.js";
import {
  buildLanguageStats,
  buildSuperlatives,
  buildProfilePayload,
} from "./transforms.js";
import {
  analyzeKnowledge,
  type KnowledgeContext,
} from "./analyzers/code-analyzer.js";
import { analyzeOverview } from "./analyzers/overview-analyzer.js";
import { withSpinner } from "./ui/spinner.js";
import ora from "ora";
import chalk from "chalk";

export interface PipelineOptions {
  wave1: Wave1Data;
  wave2: Wave2Data;
  llm?: LLMProvider;
  model?: string;
}

export async function runPipeline(
  opts: PipelineOptions
): Promise<DeveloperProfile> {
  const { wave1, wave2, llm, model } = opts;

  const ownRepos = wave1.repos.filter((r) => !r.fork);
  const languageStats = buildLanguageStats(wave1.repos, wave1.repoLanguageMap);
  const superlatives = buildSuperlatives(ownRepos, languageStats);

  const profilePayload = await withSpinner("Building profile payload", () =>
    Promise.resolve(
      buildProfilePayload(wave1, wave2, languageStats, superlatives)
    )
  );

  const result: DeveloperProfile = {
    ...profilePayload,
    analyzedAt: new Date().toISOString(),
  };

  if (!llm) {
    ora({ stream: process.stderr }).info(
      chalk.dim("No LLM provider — skipping AI analysis")
    );
    return result;
  }

  const knowledgeContext: KnowledgeContext = {
    codeReviewCount: wave1.codeReviews?.count ?? 0,
    externalPRCount: wave1.externalPRs?.length ?? 0,
    issueCount: wave1.contributionCounts?.totalIssues ?? 0,
    totalCommits: wave1.contributionCounts?.totalCommits ?? 0,
    contributedRepoCount: wave1.contributedRepos?.length ?? 0,
    contributedRepoNames: (wave1.contributedRepos ?? []).map((r) => r.fullName),
    hasSponsorListing: wave1.sponsorship?.hasListing ?? false,
    sponsorCount: wave1.sponsorship?.sponsorCount ?? 0,
  };

  const [knowledge, overview] = await withSpinner(
    "Running AI analysis (knowledge + overview)",
    () =>
      Promise.allSettled([
        analyzeKnowledge(
          llm,
          wave2.codeBlobs,
          wave2.dependencyFiles,
          knowledgeContext,
          model
        ),
        analyzeOverview(
          llm,
          profilePayload as unknown as Record<string, unknown>,
          model
        ),
      ])
  );

  const analysis: DeveloperProfile["analysis"] = {};

  if (knowledge.status === "fulfilled" && knowledge.value) {
    analysis.knowledge = knowledge.value;
    ora({ stream: process.stderr }).succeed(
      chalk.white("Knowledge analysis complete")
    );
  } else if (knowledge.status === "rejected") {
    ora({ stream: process.stderr }).fail(
      chalk.red(`Knowledge analysis failed: ${knowledge.reason}`)
    );
  }

  if (overview.status === "fulfilled") {
    analysis.overview = overview.value;
    ora({ stream: process.stderr }).succeed(
      chalk.white("Overview analysis complete")
    );
  } else if (overview.status === "rejected") {
    ora({ stream: process.stderr }).fail(
      chalk.red(`Overview analysis failed: ${overview.reason}`)
    );
  }

  if (Object.keys(analysis).length > 0) {
    result.analysis = analysis;
  }

  return result;
}
