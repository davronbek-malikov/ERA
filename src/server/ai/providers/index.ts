import { getProviderConfig } from "@/server/ai/config";
import { AiError } from "@/server/ai/errors";
import { createAnthropicProvider } from "@/server/ai/providers/anthropic";
import { createOllamaProvider } from "@/server/ai/providers/ollama";
import { createOpenAiProvider } from "@/server/ai/providers/openai";
import type { AiProvider } from "@/server/ai/types";

/** The configured provider. Throws `ai-not-configured` (safe message) when configuration is missing. */
export function getProvider(): AiProvider {
  const config = getProviderConfig();
  if (!config.ok) throw new AiError("ai-not-configured", config.reason);
  switch (config.provider) {
    case "anthropic":
      return createAnthropicProvider(config.model);
    case "openai":
      return createOpenAiProvider(config.model);
    case "ollama":
      return createOllamaProvider(config.model);
  }
}
