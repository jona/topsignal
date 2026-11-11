import type { DeveloperProfile } from "./types.js";
import { hasSecrets } from "./local/secrets.js";

type Schema = {
  type: "object" | "array" | "string";
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: false;
  items?: Schema;
  enum?: string[];
  minProperties?: number;
};
const text: Schema = { type: "string" };
const strings: Schema = { type: "array", items: text };
const object = (
  properties: Record<string, Schema>,
  required = Object.keys(properties)
): Schema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const array = (items: Schema): Schema => ({ type: "array", items });
const oneOf = (...values: string[]): Schema => ({
  type: "string",
  enum: values,
});
const node = object({
  name: text,
  evidence: strings,
  confidence: oneOf("high", "medium", "low"),
  repoExamples: strings,
});
const knowledge = object({
  techStack: array(
    object({
      name: text,
      category: oneOf(
        "language",
        "framework",
        "database",
        "cloud",
        "devtool",
        "library",
        "infrastructure"
      ),
      repoExamples: strings,
    })
  ),
  ...Object.fromEntries(
    [
      "csFundamentals",
      "architecturePatterns",
      "testingPractices",
      "systemThinking",
      "devOps",
      "security",
      "apiDesign",
      "documentation",
      "performance",
      "openSourceCitizenship",
    ].map((key) => [key, array(node)])
  ),
});
const overview = object({
  executiveSummary: text,
  seniorityLevel: oneOf("junior", "mid", "senior", "staff", "principal"),
  seniorityReasoning: text,
  roleFit: object({
    primary: text,
    secondary: strings,
    environment: oneOf("startup", "enterprise", "either"),
    environmentReasoning: text,
  }),
  strengths: array(object({ title: text, evidence: text })),
  concerns: array(object({ title: text, detail: text })),
  interviewAngles: strings,
  standoutProjects: array(object({ name: text, url: text, why: text })),
  communicationStyle: text,
  collaborationProfile: text,
  hiringRecommendation: text,
});

/** The exact schema a harness should use when producing analysis.json. */
export const analysisSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "TopSignal harness analysis",
  ...object({ knowledge, overview }, []),
  minProperties: 1,
};

function validate(value: unknown, schema: Schema, path: string): void {
  if (schema.type === "string") {
    if (
      typeof value !== "string" ||
      (schema.enum && !schema.enum.includes(value))
    ) {
      throw new Error(
        `Invalid analysis at ${path}: expected ${schema.enum?.join(" | ") ?? "a string"}.`
      );
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value))
      throw new Error(`Invalid analysis at ${path}: expected an array.`);
    value.forEach((entry, index) =>
      validate(entry, schema.items!, `${path}[${index}]`)
    );
  } else {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Invalid analysis at ${path}: expected an object.`);
    }
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length < (schema.minProperties ?? 0)) {
      throw new Error(
        `Invalid analysis at ${path}: provide knowledge or overview.`
      );
    }
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(record, key))
        throw new Error(
          `Invalid analysis at ${path}.${key}: missing required field.`
        );
    }
    for (const [key, entry] of Object.entries(record)) {
      if (!Object.hasOwn(schema.properties!, key))
        throw new Error(`Invalid analysis at ${path}.${key}: unknown field.`);
      validate(entry, schema.properties![key], `${path}.${key}`);
    }
  }
}

export function parseAnalysis(
  value: unknown
): NonNullable<DeveloperProfile["analysis"]> {
  validate(value, analysisSchema, "analysis");
  if (hasSecrets(JSON.stringify(value)))
    throw new Error(
      "Analysis contains recognized credentials; remove them before attaching or publishing."
    );
  const result = value as NonNullable<DeveloperProfile["analysis"]>;
  for (const project of result.overview?.standoutProjects ?? []) {
    if (!project.url) continue;
    let url: URL;
    try {
      url = new URL(project.url);
    } catch {
      throw new Error("Invalid analysis project URL.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      /[\x00-\x1f\x7f\\]/.test(project.url)
    ) {
      throw new Error(
        "Invalid analysis project URL: expected HTTP(S) without credentials."
      );
    }
  }
  return result;
}

const privateFields = new Set([
  "evidence",
  "codeBlobs",
  "dependencyFiles",
  "localRepos",
  "schemaVersion",
  "collectedAt",
]);
/** Reject collection artifacts before they can be attached or sent to the API. */
export function assertProfile(
  value: unknown
): asserts value is DeveloperProfile {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !(
      (value as DeveloperProfile).identity &&
      typeof (value as DeveloperProfile).identity === "object"
    ) ||
    Array.isArray((value as DeveloperProfile).identity) ||
    !Array.isArray((value as DeveloperProfile).repos)
  ) {
    throw new Error(
      "Profile JSON must contain an identity object and a repos array."
    );
  }
  const visit = (entry: unknown, path = "profile") => {
    if (!entry || typeof entry !== "object") return;
    if (Array.isArray(entry))
      return entry.forEach((item, index) => visit(item, `${path}[${index}]`));
    for (const [key, child] of Object.entries(entry)) {
      // Analysis evidence is public prose required by the existing profile schema.
      if (
        privateFields.has(key) &&
        !(key === "evidence" && path.startsWith("profile.analysis."))
      ) {
        throw new Error(
          `Private collection evidence cannot be published (${path}.${key}). Use separate profile and evidence files.`
        );
      }
      visit(child, `${path}.${key}`);
    }
  };
  visit(value);
  if ((value as DeveloperProfile).analysis !== undefined)
    parseAnalysis((value as DeveloperProfile).analysis);
}
