import { getEnv, ANTHROPIC_API_KEY, OPENAI_API_KEY } from "../env.js";

export interface LLMOptions {
  model?: string;
  maxTokens?: number;
  system?: string;
}

export interface LLMProvider {
  name: string;
  sendMessage(prompt: string, opts?: LLMOptions): Promise<string>;
}

export function detectProvider(): { provider: string; apiKey: string } {
  const anthropicKey = getEnv(ANTHROPIC_API_KEY);
  if (anthropicKey) return { provider: "anthropic", apiKey: anthropicKey };

  const openaiKey = getEnv(OPENAI_API_KEY);
  if (openaiKey) return { provider: "openai", apiKey: openaiKey };

  throw new Error(
    "No LLM API key found. Set one of:\n" +
      `  - ${ANTHROPIC_API_KEY}\n` +
      `  - ${OPENAI_API_KEY}`
  );
}

export async function createProvider(
  providerName?: string
): Promise<LLMProvider> {
  const { provider: detected, apiKey } = providerName
    ? { provider: providerName, apiKey: getKeyForProvider(providerName) }
    : detectProvider();

  switch (detected) {
    case "anthropic": {
      const { createAnthropicProvider } = await import("./anthropic.js");
      return createAnthropicProvider(apiKey);
    }
    case "openai": {
      const { createOpenAIProvider } = await import("./openai.js");
      return createOpenAIProvider(apiKey);
    }
    default:
      throw new Error(`Unknown LLM provider: ${detected}`);
  }
}

function getKeyForProvider(provider: string): string {
  const envKey = provider === "anthropic" ? ANTHROPIC_API_KEY : OPENAI_API_KEY;
  const key = getEnv(envKey);
  if (!key) throw new Error(`${envKey} not set`);
  return key;
}
