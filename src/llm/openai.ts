import type { LLMProvider, LLMOptions } from "./provider.js";
import {
  OPENAI_API_URL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_MAX_TOKENS,
} from "../env.js";

export function createOpenAIProvider(apiKey: string): LLMProvider {
  return {
    name: "openai",
    async sendMessage(prompt: string, opts?: LLMOptions): Promise<string> {
      const res = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: opts?.model ?? DEFAULT_OPENAI_MODEL,
          max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
          messages: [
            ...(opts?.system
              ? [{ role: "system" as const, content: opts.system }]
              : []),
            { role: "user" as const, content: prompt },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `OpenAI API error ${res.status}: ${body.slice(0, 200)}`
        );
      }

      const json = (await res.json()) as {
        choices: { message: { content: string } }[];
      };
      return json.choices[0]?.message?.content ?? "";
    },
  };
}
