import type { LLMProvider, LLMOptions } from "./provider.js";
import {
  ANTHROPIC_API_URL,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_MAX_TOKENS,
} from "../env.js";

export function createAnthropicProvider(apiKey: string): LLMProvider {
  return {
    name: "anthropic",
    async sendMessage(prompt: string, opts?: LLMOptions): Promise<string> {
      const res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: opts?.model ?? DEFAULT_ANTHROPIC_MODEL,
          max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
          ...(opts?.system ? { system: opts.system } : {}),
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `Anthropic API error ${res.status}: ${body.slice(0, 200)}`
        );
      }

      const json = (await res.json()) as {
        content: { type: string; text?: string }[];
      };
      const block = json.content[0];
      return block?.type === "text" ? (block.text ?? "") : "";
    },
  };
}
