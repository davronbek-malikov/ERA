import type { AgentKind, ProviderName } from "@/server/ai/types";

/*
 * AI configuration, read from environment variables on the server only (docs/ERA_AI_PROVIDER_CONFIGURATION.md).
 * No key is ever hardcoded, logged or sent to the browser.
 */

function env(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function intEnv(name: string, fallback: number, min: number, max: number) {
  const raw = env(name);
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

/** Default model per provider. Only Claude has a safe built-in default; others must be named explicitly. */
const DEFAULT_MODELS: Partial<Record<ProviderName, string>> = {
  anthropic: "claude-opus-5-5",
  // Groq (OpenAI-compatible API): an open-weight model with tool calling. Override with ERA_MODEL_NAME.
  groq: "openai/gpt-oss-120b"
};

/** Models used when a provider serves as a FALLBACK (override with ERA_MODEL_ANTHROPIC / _OPENAI / _GEMINI / _GROQ). */
const FALLBACK_MODELS: Record<Exclude<ProviderName, "ollama">, string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.5-flash",
  groq: "openai/gpt-oss-120b"
};

const AUTO_ORDER: Array<Exclude<ProviderName, "ollama">> = ["anthropic", "openai", "gemini", "groq"];

function hasKey(provider: ProviderName) {
  switch (provider) {
    case "anthropic":
      return Boolean(env("ANTHROPIC_API_KEY") ?? env("ANTHROPIC_AUTH_TOKEN"));
    case "openai":
      return Boolean(env("OPENAI_API_KEY") ?? env("ERA_API_KEY"));
    case "gemini":
      return Boolean(env("GEMINI_API_KEY") ?? env("GOOGLE_API_KEY"));
    case "groq":
      return Boolean(env("GROQ_API_KEY"));
    case "ollama":
      return true;
  }
}

function modelFor(provider: ProviderName) {
  const specific = env(`ERA_MODEL_${provider.toUpperCase()}`);
  if (specific) return specific;
  return provider === "ollama" ? env("OLLAMA_MODEL") : FALLBACK_MODELS[provider];
}

export type ProviderChain = { ok: true; providers: Array<{ provider: ProviderName; model: string }> } | { ok: false; reason: string };

/**
 * The provider used first (ERA_LLM_PROVIDER) and the ones ERA switches to when it runs out of tokens, is rate
 * limited or is down. ERA_LLM_FALLBACKS="openai,gemini,groq" sets the order; when it isn't set, every other
 * provider that has an API key is used, in the order Anthropic → OpenAI → Gemini → Groq. "none" turns it off.
 */
export function getProviderChain(): ProviderChain {
  const primary = getProviderConfig();
  if (!primary.ok) return primary;
  const providers = [{ provider: primary.provider, model: primary.model }];
  const raw = env("ERA_LLM_FALLBACKS")?.toLowerCase();
  if (raw === "none" || raw === "off") return { ok: true, providers };
  const wanted = raw
    ? raw.split(/[\s,]+/).filter(Boolean).map((name) => (name === "claude" ? "anthropic" : name))
    : AUTO_ORDER.filter((name) => hasKey(name));
  for (const name of wanted) {
    if (!["anthropic", "openai", "gemini", "groq", "ollama"].includes(name)) continue;
    const provider = name as ProviderName;
    if (providers.some((entry) => entry.provider === provider) || !hasKey(provider)) continue;
    const model = modelFor(provider);
    if (model) providers.push({ provider, model });
  }
  return { ok: true, providers };
}

export type ProviderConfig =
  | { ok: true; provider: ProviderName; model: string }
  | { ok: false; reason: string };

/** Which provider and model serve requests. Decided server-side; clients cannot choose. */
export function getProviderConfig(): ProviderConfig {
  const raw = env("ERA_LLM_PROVIDER")?.toLowerCase();
  if (!raw) return { ok: false, reason: "ERA_LLM_PROVIDER is not set" };
  const provider = raw === "claude" ? "anthropic" : raw;
  if (provider !== "anthropic" && provider !== "openai" && provider !== "gemini" && provider !== "groq" && provider !== "ollama") {
    return { ok: false, reason: `ERA_LLM_PROVIDER "${raw}" is not supported` };
  }
  const model = env("ERA_MODEL_NAME") ?? DEFAULT_MODELS[provider];
  if (!model) return { ok: false, reason: `ERA_MODEL_NAME is required for ${provider}` };
  return { ok: true, provider, model };
}

export const aiLimits = {
  /** Upper bound for one answer (includes the model's thinking on Claude). */
  maxOutputTokens: () => intEnv("ERA_AI_MAX_OUTPUT_TOKENS", 8000, 256, 64000),
  /** Earlier turns sent with each request. */
  maxHistoryMessages: () => intEnv("ERA_AI_MAX_HISTORY_MESSAGES", 12, 0, 50),
  /** Requests per user per UTC day, by agent. */
  dailyRequests: (agent: AgentKind) =>
    intEnv(
      agent === "student" ? "ERA_AI_DAILY_REQUESTS_STUDENT" : agent === "teacher" ? "ERA_AI_DAILY_REQUESTS_TEACHER" : "ERA_AI_DAILY_REQUESTS_ADMIN",
      agent === "student" ? 100 : 200,
      0,
      100_000
    ),
  /** Provider-reported tokens (input + output) per user per UTC day, all agents together. */
  dailyTokens: () => intEnv("ERA_AI_DAILY_TOKENS_PER_USER", 500_000, 0, 100_000_000),
  /** Requests per user per minute (burst protection, in-memory). */
  perMinute: () => intEnv("ERA_AI_REQUESTS_PER_MINUTE", 8, 1, 600)
};

/** Claude request options. `ERA_AI_EFFORT=""` (empty) omits effort for models that don't support it. */
export const anthropicOptions = {
  effort: (): "low" | "medium" | "high" | "xhigh" | "max" | null => {
    const raw = process.env.ERA_AI_EFFORT;
    if (raw !== undefined && raw.trim() === "") return null;
    const value = (raw ?? "medium").trim().toLowerCase();
    return value === "low" || value === "medium" || value === "high" || value === "xhigh" || value === "max" ? value : "medium";
  },
  /** Server-side refusal fallback ("default" routing). Set ERA_AI_ANTHROPIC_FALLBACKS=off to disable. */
  fallbacksEnabled: () => (env("ERA_AI_ANTHROPIC_FALLBACKS") ?? "default").toLowerCase() !== "off"
};

/*
 * Prices in USD per million tokens. Claude prices are Anthropic's published first-party rates at the time
 * of writing (verify at https://www.anthropic.com/pricing before relying on them). Other providers have no
 * built-in price: set ERA_AI_PRICE_INPUT_PER_MTOK / ERA_AI_PRICE_OUTPUT_PER_MTOK, otherwise cost is recorded
 * as null — never guessed.
 */
const PRICE_TABLE: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 }
};

export function getModelPrice(model: string): { input: number; output: number } | null {
  const input = Number(env("ERA_AI_PRICE_INPUT_PER_MTOK"));
  const output = Number(env("ERA_AI_PRICE_OUTPUT_PER_MTOK"));
  if (Number.isFinite(input) && Number.isFinite(output) && env("ERA_AI_PRICE_INPUT_PER_MTOK") && env("ERA_AI_PRICE_OUTPUT_PER_MTOK")) {
    return { input, output };
  }
  return PRICE_TABLE[model] ?? null;
}

export function providerEnv() {
  return {
    openaiApiKey: env("OPENAI_API_KEY") ?? env("ERA_API_KEY"),
    openaiBaseUrl: (env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
    groqApiKey: env("GROQ_API_KEY"),
    geminiApiKey: env("GEMINI_API_KEY") ?? env("GOOGLE_API_KEY"),
    geminiBaseUrl: (env("GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, ""),
    groqBaseUrl: (env("GROQ_BASE_URL") ?? "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
    ollamaBaseUrl: (env("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434").replace(/\/+$/, "")
  };
}
