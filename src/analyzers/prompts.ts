import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PROMPTS_DIR } from "../env.js";

export type PromptName = "knowledge" | "overview";

let promptsDir: string | null = null;

export function setPromptsDir(dir: string | undefined) {
  promptsDir = dir ?? null;
}

export function loadCustomPrompt(name: PromptName): string | null {
  const dirs = [promptsDir, DEFAULT_PROMPTS_DIR].filter(Boolean) as string[];

  for (const dir of dirs) {
    const path = join(dir, `${name}.md`);
    if (existsSync(path)) {
      return readFileSync(path, "utf-8");
    }
  }

  return null;
}

export function interpolate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_, key: string) => vars[key] ?? ""
  );
}
