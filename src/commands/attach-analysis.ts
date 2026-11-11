import { readFileSync, writeFileSync } from "node:fs";
import { assertProfile, parseAnalysis } from "../analysis.js";

export function attachAnalysis(
  profileFile: string,
  analysisFile: string,
  opts: { output?: string } = {}
): void {
  const profile: unknown = JSON.parse(readFileSync(profileFile, "utf8"));
  assertProfile(profile);
  const analysis = parseAnalysis(
    JSON.parse(readFileSync(analysisFile, "utf8"))
  );
  const result = { ...profile, analysis, analyzedAt: new Date().toISOString() };
  const json = JSON.stringify(result, null, 2) + "\n";
  if (opts.output) writeFileSync(opts.output, json);
  else process.stdout.write(json);
}
