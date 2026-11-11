import { writeFileSync } from "node:fs";
import { buildAnalysisPrompt } from "../prompts.js";

export interface AnalysisPromptOptions {
  prompts?: string;
  output?: string;
  json?: boolean;
}

export function analysisPrompt(
  section = "all",
  opts: AnalysisPromptOptions = {}
): void {
  const result = buildAnalysisPrompt(section, opts);
  const rendered = opts.json
    ? JSON.stringify(result, null, 2) + "\n"
    : result.prompt;
  if (opts.output) writeFileSync(opts.output, rendered, "utf8");
  else process.stdout.write(rendered);
}
