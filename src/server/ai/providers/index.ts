import { getProviderChain } from "@/server/ai/config";
import { AiError } from "@/server/ai/errors";
import { createAnthropicProvider } from "@/server/ai/providers/anthropic";
import { createOllamaProvider } from "@/server/ai/providers/ollama";
import { createOpenAiProvider } from "@/server/ai/providers/openai";
import type { AiErrorCode } from "@/server/ai/errors";
import type { AiProvider, ProviderEvent, ProviderName, ProviderRequest } from "@/server/ai/types";

function createProvider(provider: ProviderName, model: string): AiProvider {
  switch (provider) {
    case "anthropic":
      return createAnthropicProvider(model);
    case "openai":
      return createOpenAiProvider(model);
    case "gemini":
      return createOpenAiProvider(model, "gemini");
    case "groq":
      return createOpenAiProvider(model, "groq");
    case "ollama":
      return createOllamaProvider(model);
  }
}

/** Failures that another provider may not have: out of tokens / rate limited, down, bad or missing key. */
const SWITCH_ON: ReadonlySet<AiErrorCode> = new Set<AiErrorCode>([
  "ai-provider-busy",
  "ai-provider-unavailable",
  "ai-provider-auth",
  "ai-not-configured",
  "ai-stream-interrupted",
  "ai-empty-response"
]);

/**
 * A provider that failed is skipped for a while, so the next questions go straight to one that works instead of
 * waiting for the same failure again (per server instance; it simply resets on a new deployment).
 */
const coolingDown = new Map<string, number>();
const COOL_DOWN_MS: Partial<Record<AiErrorCode, number>> = {
  "ai-provider-busy": 5 * 60_000,
  "ai-provider-auth": 30 * 60_000,
  "ai-not-configured": 30 * 60_000
};
const DEFAULT_COOL_DOWN_MS = 2 * 60_000;

export function resetProviderCoolDowns() {
  coolingDown.clear();
}

/**
 * Tries the providers in order. If one fails with a switchable error, the next one answers: before anything was
 * streamed the switch is invisible; after, a `reset` event tells the engine to discard the partial answer.
 */
export function createFallbackProvider(providers: AiProvider[]): AiProvider {
  let active = providers[0];
  return {
    get name() {
      return active.name;
    },
    get model() {
      return active.model;
    },
    async *stream(request: ProviderRequest): AsyncGenerator<ProviderEvent> {
      const now = Date.now();
      const key = (provider: AiProvider) => `${provider.name}:${provider.model}`;
      const ready = providers.filter((provider) => (coolingDown.get(key(provider)) ?? 0) <= now);
      const resting = providers.filter((provider) => (coolingDown.get(key(provider)) ?? 0) > now);
      let lastError: AiError | null = null;
      for (const provider of [...ready, ...resting]) {
        active = provider;
        let streamed = false;
        try {
          for await (const event of provider.stream(request)) {
            if (event.type === "text") streamed = true;
            yield event;
          }
          coolingDown.delete(key(provider));
          return;
        } catch (error) {
          if (!(error instanceof AiError) || !SWITCH_ON.has(error.code) || request.signal.aborted) throw error;
          lastError = error;
          coolingDown.set(key(provider), Date.now() + (COOL_DOWN_MS[error.code] ?? DEFAULT_COOL_DOWN_MS));
          console.warn(`[ai-fallback] ${provider.name} failed (${error.code}${error.logDetail ? `: ${error.logDetail}` : ""}); trying the next provider`);
          if (streamed) yield { type: "reset" };
        }
      }
      throw lastError ?? new AiError("ai-provider-unavailable", "no provider answered");
    }
  };
}

/** The configured provider (with automatic fallbacks). Throws `ai-not-configured` (safe message) when missing. */
export function getProvider(): AiProvider {
  const chain = getProviderChain();
  if (!chain.ok) throw new AiError("ai-not-configured", chain.reason);
  const providers = chain.providers.map((entry) => createProvider(entry.provider, entry.model));
  return providers.length === 1 ? providers[0] : createFallbackProvider(providers);
}
