import { AiError } from "@/server/ai/errors";
import { getProvider } from "@/server/ai/providers";
import type { AgentKind, ProviderUsage } from "@/server/ai/types";
import { AGENT_ENUM } from "@/server/ai/types";
import { assertUsageAllowed, recordUsage } from "@/server/ai/usage";

/*
 * One AI call for the study room (generation, answers, grading). It goes through the same provider chain as the
 * assistants (Anthropic → OpenAI → Gemini → Groq, switching automatically when one is out of tokens or down),
 * respects the per-user daily limits, and records usage and cost like every other AI call in ERA.
 */
export async function studyCompletion(options: {
  userId: string;
  agent: AgentKind;
  system: string;
  prompt: string;
  maxOutputTokens: number;
  json?: boolean;
  long?: boolean;
  checkLimits?: boolean;
  timeoutMs?: number;
}): Promise<{ text: string; provider: string; model: string }> {
  const agentEnum = AGENT_ENUM[options.agent];
  if (options.checkLimits !== false) await assertUsageAllowed(options.userId, options.agent, agentEnum);
  const provider = getProvider();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 240_000);
  const started = Date.now();
  let text = "";
  let usage: ProviderUsage | null = null;
  let model = provider.model;
  try {
    for await (const event of provider.stream({
      system: options.system,
      messages: [{ role: "user", content: options.prompt }],
      maxOutputTokens: options.maxOutputTokens,
      signal: controller.signal,
      allowLongOutput: options.long,
      json: options.json
    })) {
      if (event.type === "text") text += event.text;
      else if (event.type === "reset") text = "";
      else if (event.type === "done") {
        usage = event.usage;
        model = event.model;
        if (event.finalText) text = event.finalText;
      }
    }
    if (!text.trim()) throw new AiError("ai-empty-response");
    await recordUsage({ userId: options.userId, agent: agentEnum, provider: provider.name, model, conversationId: null, usage, durationMs: Date.now() - started, status: "SUCCESS" });
    return { text, provider: provider.name, model };
  } catch (error) {
    const aiError = error instanceof AiError ? error : new AiError(controller.signal.aborted ? "ai-stream-interrupted" : "ai-provider-unavailable", error instanceof Error ? error.message : "unknown");
    if (aiError.logDetail) console.error(`[study-ai] ${aiError.code}: ${aiError.logDetail}`);
    await recordUsage({ userId: options.userId, agent: agentEnum, provider: provider.name, model, conversationId: null, usage, durationMs: Date.now() - started, status: "FAILED", errorCode: aiError.code });
    throw aiError;
  } finally {
    clearTimeout(timer);
  }
}
