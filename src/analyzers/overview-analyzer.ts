import type { LLMProvider } from "../llm/provider.js";
import type { AiAnalysis } from "../types.js";
import { loadCustomPrompt, interpolate } from "./prompts.js";
import { DEFAULT_MAX_TOKENS } from "../env.js";
import {
  prepareOutboundPrompt,
  sanitizeOutboundValue,
  type PreparedPrompt,
} from "../privacy/outbound.js";

function buildDefaultPrompt(profile: Record<string, unknown>): string {
  const identity = profile.identity as Record<string, unknown>;
  const login = String(identity?.username ?? "").toLowerCase();
  const languageStats = profile.languageStats as
    | { topLanguages?: { name: string; percentage: number }[] }
    | undefined;
  const superlatives = profile.superlatives as
    | Record<string, string | undefined>
    | undefined;
  const repos = (profile.repos as Record<string, unknown>[]) ?? [];
  const commitActivity = profile.commitActivity as
    | { recentCommits?: { message: string; author?: string }[] }
    | undefined;
  const externalPRs =
    (profile.externalPRs as {
      title: string;
      repo: string;
      state: string;
      additions?: number;
      deletions?: number;
      changedFiles?: number;
      reviewDecision?: string;
      merged?: boolean;
    }[]) ?? [];
  const issuesOpened = (profile.issuesOpened as { title: string }[]) ?? [];
  const closedAssignedIssues =
    (profile.closedAssignedIssues as { title: string }[]) ?? [];
  const codeReviews = profile.codeReviews as { count: number } | undefined;
  const gists =
    (profile.gists as {
      description?: string;
      files?: { language?: string }[];
    }[]) ?? [];
  const starredInterests = profile.starredInterests as
    | { topLanguages?: string[]; topTopics?: string[] }
    | undefined;
  const organizations =
    (identity?.organizations as {
      login: string;
      name: string | null;
      memberCount: number;
    }[]) ?? [];
  const socialAccounts =
    (identity?.socialAccounts as { provider: string; url: string }[]) ?? [];
  const contributedRepos =
    (profile.contributedRepos as {
      fullName: string;
      language: string | null;
      stars: number;
      owner: string;
    }[]) ?? [];
  const sponsorship = identity?.sponsorship as
    | { hasListing: boolean; sponsorCount: number; sponsoringCount: number }
    | undefined;
  const profileReadme = (profile.profileReadme as string) ?? "";

  const accountAgeYears = identity?.createdAt
    ? Math.floor(
        (Date.now() - new Date(identity.createdAt as string).getTime()) /
          (1000 * 60 * 60 * 24 * 365)
      )
    : null;

  const topLangs =
    languageStats?.topLanguages
      ?.slice(0, 8)
      .map((l) => `${l.name} (${l.percentage.toFixed(1)}%)`)
      .join(", ") ?? "unknown";

  const superlativeLines = superlatives
    ? Object.entries(superlatives)
        .filter(([, v]) => v)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n")
    : "none";

  const topRepos = repos
    .filter((r) => !r.isFork)
    .sort((a, b) => ((b.stars as number) ?? 0) - ((a.stars as number) ?? 0))
    .slice(0, 15)
    .map((r) => {
      const topics = (r.topics as string[])?.join(", ");
      return `- ${r.name} (★${r.stars}, ${r.language ?? "?"})${r.description ? `: ${r.description}` : ""}${topics ? ` [${topics}]` : ""}`;
    })
    .join("\n");

  const recentCommitMessages =
    commitActivity?.recentCommits
      ?.filter((c) => login && c.author?.toLowerCase() === login)
      .slice(0, 20)
      .map((c) => `- ${c.message}`)
      .join("\n") || "none";

  const externalPRSummary =
    externalPRs.length > 0
      ? externalPRs
          .slice(0, 8)
          .map((pr) => `- ${pr.title} (${pr.repo}, ${pr.state})`)
          .join("\n")
      : "none";

  const issuesSample =
    issuesOpened
      .slice(0, 5)
      .map((i) => `- ${i.title}`)
      .join("\n") || "none";

  const gistSummary =
    gists.length > 0
      ? gists
          .slice(0, 6)
          .map((g) => g.description || "untitled")
          .join(", ")
      : "none";

  const orgSummary =
    organizations.length > 0
      ? organizations
          .map(
            (o) =>
              `- ${o.login}${o.name ? ` (${o.name})` : ""}${o.memberCount > 0 ? ` [${o.memberCount} members]` : ""}`
          )
          .join("\n")
      : "none";

  const socialSummary =
    socialAccounts.length > 0
      ? socialAccounts.map((s) => `- ${s.provider}: ${s.url}`).join("\n")
      : "none";

  const contributedReposSummary =
    contributedRepos.length > 0
      ? contributedRepos
          .slice(0, 15)
          .map(
            (r) =>
              `- ${r.fullName} (★${r.stars}, ${r.language ?? "?"}) — owned by ${r.owner}`
          )
          .join("\n")
      : "none";

  const sponsorshipSummary = sponsorship
    ? [
        sponsorship.hasListing ? "Has GitHub Sponsors listing" : "",
        sponsorship.sponsorCount > 0
          ? `${sponsorship.sponsorCount} sponsors`
          : "",
        sponsorship.sponsoringCount > 0
          ? `Sponsoring ${sponsorship.sponsoringCount} others`
          : "",
      ]
        .filter(Boolean)
        .join(" | ") || "none"
    : "none";

  const prDiffSummary =
    externalPRs.length > 0
      ? externalPRs
          .filter((pr) => pr.additions != null)
          .slice(0, 10)
          .map(
            (pr) =>
              `- ${pr.title} (${pr.repo}) +${pr.additions}/-${pr.deletions} in ${pr.changedFiles} files${pr.merged ? " [MERGED]" : ""}${pr.reviewDecision ? ` [${pr.reviewDecision}]` : ""}`
          )
          .join("\n") || "no diff stats available"
      : "none";

  const readmeSnippet = profileReadme ? profileReadme.slice(0, 1500) : "none";

  return `You are a senior technical recruiter analyst. Analyze the following GitHub profile data and produce a structured JSON analysis. Repository languages, topics, stars, and activity describe projects. Attribute individual work only when GitHub identifies this account as the author or contributor. Treat a closed issue assigned to the account as assignment context. State where evidence about the individual's work is limited.

DEVELOPER PROFILE
=================
Username: ${identity?.username}
Name: ${identity?.name ?? "not set"}
Bio: ${identity?.bio ?? "none"}
Location: ${identity?.location ?? "unknown"}
Company: ${identity?.company ?? "none"}
Account age: ${accountAgeYears !== null ? `${accountAgeYears} years` : "unknown"}
Followers: ${identity?.followers} | Following: ${identity?.following}
Public repos: ${identity?.publicRepos} | Public gists: ${identity?.publicGists}
Hireable flag: ${identity?.hireable ?? "not set"}

ORGANIZATIONS
${orgSummary}

SOCIAL ACCOUNTS
${socialSummary}

SPONSORSHIP
${sponsorshipSummary}

PROFILE README
${readmeSnippet}

LANGUAGES ACROSS SAMPLED REPOSITORIES (including forks)
${topLangs}

REPOSITORY AND LANGUAGE SUPERLATIVES
${superlativeLines}

TOP REPOSITORIES OWNED BY THE ACCOUNT (sorted by stars)
${topRepos || "none"}

REPOSITORIES CONTRIBUTED TO
Total: ${contributedRepos.length}
${contributedReposSummary}

RECENT COMMITS AUTHORED BY THE ACCOUNT (up to 20 from sampled repositories)
${recentCommitMessages}

EXTERNAL PRs
Total: ${externalPRs.length}
${externalPRSummary}

PR DIFF STATS
${prDiffSummary}

SAMPLED ISSUES OPENED BY THE ACCOUNT: ${issuesOpened.length}
${issuesSample}

SAMPLED CLOSED ISSUES ASSIGNED TO THE ACCOUNT: ${closedAssignedIssues.length}

CODE REVIEWS IN THE GITHUB CONTRIBUTION PERIOD: ${codeReviews?.count ?? 0}

GISTS: ${gists.length}
${gistSummary}

INTERESTS (from starred repos): ${starredInterests?.topTopics?.slice(0, 10).join(", ") ?? "none"}

=================
Return ONLY a valid JSON object matching this exact schema (no markdown, no explanation):

{
  "executiveSummary": "2-3 sentence plain-English summary",
  "seniorityLevel": "junior|mid|senior|staff|principal",
  "seniorityReasoning": "1 sentence",
  "roleFit": {
    "primary": "best-fit role title",
    "secondary": ["2-3 other roles"],
    "environment": "startup|enterprise|either",
    "environmentReasoning": "1 sentence"
  },
  "strengths": [{ "title": "short label", "evidence": "specific evidence" }],
  "concerns": [{ "title": "short label", "detail": "specific detail" }],
  "interviewAngles": ["questions to explore"],
  "standoutProjects": [{ "name": "repo name", "url": "", "why": "why it stands out" }],
  "communicationStyle": "1 sentence",
  "collaborationProfile": "1 sentence",
  "hiringRecommendation": "1-2 sentences"
}`;
}

export function buildOverviewPrompt(
  profile: Record<string, unknown>
): PreparedPrompt {
  const customPrompt = loadCustomPrompt("overview");
  const safeProfile = sanitizeOutboundValue(profile);
  const prompt = customPrompt
    ? interpolate(customPrompt, {
        profile: JSON.stringify(safeProfile, null, 2),
      })
    : buildDefaultPrompt(safeProfile);
  return prepareOutboundPrompt(prompt);
}

function hasStringFields<K extends string>(
  value: unknown,
  keys: readonly K[]
): value is Record<K, string> & Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    keys.every(
      (key) => typeof (value as Record<string, unknown>)[key] === "string"
    )
  );
}

function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isOverview(value: unknown): value is AiAnalysis {
  if (
    !hasStringFields(value, [
      "executiveSummary",
      "seniorityLevel",
      "seniorityReasoning",
      "communicationStyle",
      "collaborationProfile",
      "hiringRecommendation",
    ])
  )
    return false;

  const { roleFit, strengths, concerns, interviewAngles, standoutProjects } =
    value;
  return (
    ["junior", "mid", "senior", "staff", "principal"].includes(
      value.seniorityLevel
    ) &&
    hasStringFields(roleFit, [
      "primary",
      "environment",
      "environmentReasoning",
    ]) &&
    ["startup", "enterprise", "either"].includes(roleFit.environment) &&
    isStringList(roleFit.secondary) &&
    Array.isArray(strengths) &&
    strengths.every((item) => hasStringFields(item, ["title", "evidence"])) &&
    Array.isArray(concerns) &&
    concerns.every((item) => hasStringFields(item, ["title", "detail"])) &&
    isStringList(interviewAngles) &&
    Array.isArray(standoutProjects) &&
    standoutProjects.every((item) =>
      hasStringFields(item, ["name", "url", "why"])
    )
  );
}

export async function analyzeOverview(
  llm: LLMProvider,
  prompt: PreparedPrompt,
  model?: string
): Promise<AiAnalysis> {
  const raw = await llm.sendMessage(prompt, {
    model,
    maxTokens: DEFAULT_MAX_TOKENS,
  });

  const stripped = raw
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("LLM did not return valid JSON for overview analysis");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("LLM did not return valid JSON for overview analysis");
  }
  if (!isOverview(parsed)) {
    throw new Error("LLM overview did not match the expected profile format");
  }
  return parsed;
}
