import type { LLMProvider } from "../llm/provider.js";
import type {
  CodeBlob,
  RepoDependencyData,
  AnalyzedKnowledge,
  KnowledgeNode,
  TechStackItem,
} from "../types.js";
import { loadCustomPrompt, interpolate } from "./prompts.js";
import { DEFAULT_MAX_TOKENS } from "../env.js";

export interface KnowledgeContext {
  codeReviewCount: number;
  externalPRCount: number;
  issueCount: number;
  totalCommits: number;
  contributedRepoCount: number;
  contributedRepoNames: string[];
  hasSponsorListing: boolean;
  sponsorCount: number;
}

const KNOWLEDGE_SECTION_DESCRIPTIONS: Record<
  Exclude<keyof AnalyzedKnowledge, "techStack">,
  string
> = {
  csFundamentals:
    "Data Structures, Algorithms, Concurrency & Parallelism, Systems Programming, Compiler/Parsing, Machine Learning",
  architecturePatterns:
    "Microservices, Event-Driven systems, Clean/Hexagonal Architecture, DDD, CQRS/Event Sourcing, Serverless/Edge, Monorepo, Plugin/Middleware, REST, GraphQL",
  testingPractices:
    "Unit Testing, Integration Testing, E2E Testing, TDD/BDD, Load & Performance Testing, Snapshot Testing, Mocking & Fixtures, Coverage tooling",
  systemThinking:
    "Performance Optimization, Scalability, Observability, Resilience, API Design, Database Design, Platform/Infrastructure engineering",
  devOps:
    "Containerization, Orchestration, CI/CD Pipelines, Infrastructure as Code, GitOps, Monitoring & Alerting, Log Management",
  security:
    "Auth & Identity, Secrets Management, Dependency Scanning, Static Analysis, Encryption & TLS, Security Policy, Vulnerability Management",
  apiDesign:
    "REST APIs, GraphQL, gRPC/Protobuf, API Versioning, Webhooks, Rate Limiting, API Documentation",
  documentation:
    "README quality, API Docs, Changelog, Contributing guides, Docs sites, ADRs/RFCs, Inline comments",
  performance:
    "Benchmarking, Caching, Profiling, Database query optimization, Code optimization, Lazy loading, Concurrency for throughput",
  openSourceCitizenship:
    "Published packages, Developer tools & CLIs, Learning resources, License compliance, Community infrastructure, Code review contributions",
};

function buildDefaultPrompt(
  blobs: CodeBlob[],
  depFiles: RepoDependencyData[],
  context: KnowledgeContext
): string {
  const parts: string[] = [];

  if (blobs.length > 0) {
    const filesText = blobs
      .map(
        (b, i) =>
          `=== Source ${i + 1}: ${b.repoName}/${b.path} (${b.language}) ===\n${b.content}`
      )
      .join("\n\n");
    parts.push("## SOURCE CODE\n" + filesText);
  }

  const configBlocks: string[] = [];
  const seen = new Set<string>();
  for (const dep of depFiles.slice(0, 12)) {
    if (seen.has(dep.repoName)) continue;
    seen.add(dep.repoName);
    const configs: string[] = [];
    if (dep.dockerfile)
      configs.push(`Dockerfile:\n${dep.dockerfile.slice(0, 1200)}`);
    if (dep.dockerCompose)
      configs.push(`docker-compose.yml:\n${dep.dockerCompose.slice(0, 1200)}`);
    if (dep.packageJson)
      configs.push(`package.json:\n${dep.packageJson.slice(0, 1200)}`);
    if (dep.goMod) configs.push(`go.mod:\n${dep.goMod.slice(0, 800)}`);
    if (dep.cargoToml)
      configs.push(`Cargo.toml:\n${dep.cargoToml.slice(0, 800)}`);
    if (dep.pyproject)
      configs.push(`pyproject.toml:\n${dep.pyproject.slice(0, 800)}`);
    if (dep.requirements)
      configs.push(`requirements.txt:\n${dep.requirements.slice(0, 600)}`);
    if (dep.readme)
      configs.push(`README (excerpt):\n${dep.readme.slice(0, 1500)}`);
    if (dep.securityMd)
      configs.push(`SECURITY.md:\n${dep.securityMd.slice(0, 600)}`);
    if (dep.changelogMd)
      configs.push(`CHANGELOG:\n${dep.changelogMd.slice(0, 600)}`);
    if (dep.openapi)
      configs.push(`openapi.yml (excerpt):\n${dep.openapi.slice(0, 1000)}`);
    if (configs.length > 0) {
      configBlocks.push(`--- Repo: ${dep.repoName} ---\n${configs.join("\n")}`);
    }
  }
  if (configBlocks.length > 0) {
    parts.push("## CONFIG & MANIFEST FILES\n" + configBlocks.join("\n\n"));
  }

  const ctxLines: string[] = [];
  if (context.codeReviewCount > 0)
    ctxLines.push(`${context.codeReviewCount} PR reviews`);
  if (context.externalPRCount > 0)
    ctxLines.push(`${context.externalPRCount} external PRs`);
  if (context.totalCommits > 0)
    ctxLines.push(`${context.totalCommits} total commits`);
  if (ctxLines.length > 0) {
    parts.push("## CONTRIBUTION STATS\n" + ctxLines.join("\n"));
  }

  const sectionList = Object.entries(KNOWLEDGE_SECTION_DESCRIPTIONS)
    .map(([key, desc], i) => `${i + 1}. "${key}": ${desc}`)
    .join("\n\n");

  return `You are a principal software engineer doing a thorough review of a developer's public work. Analyze all the provided files and fill in the techStack inventory and 10 knowledge categories based strictly on evidence in the files.

${parts.join("\n\n")}

---

## 1. Tech Stack Inventory

Identify every concrete technology this developer uses.

Return as "techStack": an array of objects:
{ "name": string, "category": "language" | "framework" | "database" | "cloud" | "devtool" | "library" | "infrastructure", "repoExamples": string[] }

## 2. Knowledge Categories

Fill in these 10 categories:

${sectionList}

Each key maps to an array of objects:
{ "name": string, "evidence": string[], "confidence": "high" | "medium" | "low", "repoExamples": string[] }

---

Return a single JSON object with exactly these 11 keys:
techStack, csFundamentals, architecturePatterns, testingPractices, systemThinking, devOps, security, apiDesign, documentation, performance, openSourceCitizenship

Rules:
- Only include entries with real evidence.
- Be precise — name the file path, function, config section, or code pattern.
- Empty array [] is valid for categories with no evidence.
- Return valid JSON only. No markdown fences. No explanation.`;
}

function isKnowledgeNode(n: unknown): n is KnowledgeNode {
  return (
    typeof (n as KnowledgeNode).name === "string" &&
    Array.isArray((n as KnowledgeNode).evidence) &&
    ["high", "medium", "low"].includes((n as KnowledgeNode).confidence) &&
    Array.isArray((n as KnowledgeNode).repoExamples)
  );
}

const TECH_STACK_CATEGORIES = [
  "language",
  "framework",
  "database",
  "cloud",
  "devtool",
  "library",
  "infrastructure",
] as const;

function isTechStackItem(n: unknown): n is TechStackItem {
  return (
    typeof (n as TechStackItem).name === "string" &&
    TECH_STACK_CATEGORIES.includes(
      (n as TechStackItem).category as (typeof TECH_STACK_CATEGORIES)[number]
    ) &&
    Array.isArray((n as TechStackItem).repoExamples)
  );
}

function parseResponse(text: string): AnalyzedKnowledge | null {
  const stripped = text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    const result = {} as AnalyzedKnowledge;

    result.techStack = Array.isArray(parsed.techStack)
      ? parsed.techStack.filter(isTechStackItem)
      : [];

    const keys = Object.keys(KNOWLEDGE_SECTION_DESCRIPTIONS) as Exclude<
      keyof AnalyzedKnowledge,
      "techStack"
    >[];
    for (const key of keys) {
      const arr = parsed[key];
      result[key] = Array.isArray(arr) ? arr.filter(isKnowledgeNode) : [];
    }
    return result;
  } catch {
    return null;
  }
}

export async function analyzeKnowledge(
  llm: LLMProvider,
  blobs: CodeBlob[],
  depFiles: RepoDependencyData[],
  context: KnowledgeContext,
  model?: string
): Promise<AnalyzedKnowledge | null> {
  if (blobs.length === 0 && depFiles.length === 0) return null;

  const customPrompt = loadCustomPrompt("knowledge");
  const prompt = customPrompt
    ? interpolate(customPrompt, {
        sourceCode: blobs
          .map((b) => `${b.repoName}/${b.path}:\n${b.content}`)
          .join("\n\n"),
        configFiles: depFiles
          .map((d) => `${d.repoName}: ${JSON.stringify(d)}`)
          .join("\n"),
        stats: JSON.stringify(context),
      })
    : buildDefaultPrompt(blobs, depFiles, context);

  const text = await llm.sendMessage(prompt, {
    model,
    maxTokens: DEFAULT_MAX_TOKENS,
  });
  const result = parseResponse(text);
  if (!result) {
    throw new Error("Could not parse AI knowledge response");
  }
  return result;
}
