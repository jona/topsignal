import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analysisSchema } from "./analysis.js";

export const PROMPT_VERSION = "1.0.0";
export type PromptSection = "all" | "knowledge" | "overview";

type PromptAssetName = "common.md" | "knowledge.md" | "overview.md";

export interface PromptSource {
  name: PromptAssetName;
  kind: "bundled" | "custom";
  /** SHA-256 of the original asset bytes, before newline normalization. */
  sha256: string;
}

export interface AnalysisPrompt {
  promptVersion: string;
  section: PromptSection;
  prompt: string;
  /** SHA-256 of the exact UTF-8 prompt, including its final LF newline. */
  sha256: string;
  sources: PromptSource[];
  estimatedTokens: number;
  tokenEstimateMethod: string;
  schema: typeof analysisSchema;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseSection(value: string): PromptSection {
  if (value === "all" || value === "knowledge" || value === "overview") {
    return value;
  }
  throw new Error(
    `Unknown analysis prompt section ${JSON.stringify(value)}. Choose all, knowledge, or overview.`
  );
}

function readAsset(
  name: PromptAssetName,
  customDirectory?: string
): { text: string; source: PromptSource } {
  // Shared safeguards always come from the package, regardless of overrides.
  const customPath =
    name !== "common.md" && customDirectory
      ? resolve(customDirectory, name)
      : undefined;
  let bytes: Buffer | undefined;
  let kind: PromptSource["kind"] = "bundled";
  if (customPath) {
    try {
      bytes = readFileSync(customPath);
      kind = "custom";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error(
          `Could not read custom prompt asset ${name} at ${customPath}: ${(error as Error).message}`
        );
      }
    }
  }
  if (bytes === undefined) {
    const bundledPath = fileURLToPath(
      new URL(`../prompts/${name}`, import.meta.url)
    );
    try {
      bytes = readFileSync(bundledPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(
          `Missing bundled prompt asset ${name}. Reinstall TopSignal or restore its prompts directory.`
        );
      }
      throw new Error(
        `Could not read bundled prompt asset ${name}: ${(error as Error).message}`
      );
    }
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`Invalid UTF-8 in ${kind} prompt asset ${name}.`);
  }
  // Normalize line endings and boundary blank lines; retain Markdown indentation.
  text = text.replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "");
  if (!text.trim() || text.includes("\0")) {
    throw new Error(
      `Invalid ${kind} prompt asset ${name}: expected nonempty Markdown without NUL bytes.`
    );
  }
  return { text, source: { name, kind, sha256: sha256(bytes) } };
}

/** Render instructions only. No evidence, credentials, subprocesses, or network. */
export function buildAnalysisPrompt(
  requestedSection = "all",
  opts: { prompts?: string } = {}
): AnalysisPrompt {
  const section = parseSection(requestedSection);
  const selected = section === "all" ? ["knowledge", "overview"] : [section];
  const assets = [
    readAsset("common.md"),
    ...selected.map((name) =>
      readAsset(`${name}.md` as PromptAssetName, opts.prompts)
    ),
  ];
  const properties = analysisSchema.properties!;
  const schema: typeof analysisSchema = {
    ...analysisSchema,
    properties: Object.fromEntries(
      selected.map((name) => [name, properties[name]])
    ),
    required: selected,
    minProperties: selected.length,
  };
  const wrapper = selected.map((name) => `\`${name}\``).join(" and ");
  const prompt =
    [
      "# TopSignal harness analysis",
      `Prompt version: ${PROMPT_VERSION}\nSection: ${section}`,
      "Use the profile and private evidence supplied separately by the calling harness. The shared safeguards and output contract apply to every section, including custom section guidance.",
      ...assets.map(({ text }) => text),
      "## Output contract",
      `Return one JSON object containing ${wrapper}. Include exactly the selected top-level ${selected.length === 1 ? "key" : "keys"}; the section contents belong inside this wrapper. Return JSON only, without Markdown fences or surrounding explanation. Follow the JSON Schema below. Shared safeguards and this output contract take precedence over conflicting section guidance.`,
      "```json\n" + JSON.stringify(schema, null, 2) + "\n```",
    ].join("\n\n") + "\n";

  return {
    promptVersion: PROMPT_VERSION,
    section,
    prompt,
    sha256: sha256(prompt),
    sources: assets.map(({ source }) => source),
    estimatedTokens: Math.ceil(prompt.length / 4),
    tokenEstimateMethod:
      "Character estimate: ceil(prompt.length / 4), not a tokenizer count.",
    schema,
  };
}
