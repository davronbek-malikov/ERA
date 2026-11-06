import { UserRole } from "@prisma/client";

import { aiLimits } from "@/server/ai/config";
import { saveCompletedTurn } from "@/server/ai/conversations";
import { AiError } from "@/server/ai/errors";
import { markCitedSources } from "@/server/ai/knowledge";
import { buildSystemPrompt } from "@/server/ai/prompts";
import { getProvider } from "@/server/ai/providers";
import type { AgentKind, AiProvider, EngineEvent, EngineMessage, ExecutionContext, ProviderUsage } from "@/server/ai/types";
import { AGENT_ENUM } from "@/server/ai/types";
import { assertUsageAllowed, recordUsage } from "@/server/ai/usage";
import { authErrors } from "@/server/authz";

/*
 * ERA AI Agent Engine (docs/ERA_AI_ARCHITECTURE.md). One engine, three agents.
 *
 *   route handler ─ authz (src/server/authz.ts) ─ context builder ─► prepareAgentRun ─► runAgent ─► SSE / JSON
 *
 * The engine receives an already-authorized ExecutionContext. It re-checks the agent/role pairing as defence
 * in depth, enforces usage limits, builds the prompt centrally, streams from the configured provider, saves the
 * exchange only when the answer completed, and records usage for every outcome.
 */

/** Which roles may run each agent. Routes enforce finer rules (enrollment, course ownership) before this. */
const AGENT_ROLES: Record<AgentKind, UserRole[]> = {
  student: [UserRole.STUDENT],
  teacher: [UserRole.INSTRUCTOR, UserRole.ADMIN],
  admin: [UserRole.ADMIN]
};

export type PreparedRun = { context: ExecutionContext; provider: AiProvider };

/** Throws before any streaming starts, so routes can still answer with a normal HTTP status. */
export async function prepareAgentRun(context: ExecutionContext): Promise<PreparedRun> {
  if (!AGENT_ROLES[context.agent].includes(context.user.role)) {
    throw authErrors.forbidden("You don't have access to this assistant.");
  }
  const provider = getProvider();
  const agentEnum = AGENT_ENUM[context.agent];
  try {
    await assertUsageAllowed(context.user.id, context.agent, agentEnum);
  } catch (error) {
    if (error instanceof AiError) {
      await recordUsage({
        userId: context.user.id,
        agent: agentEnum,
        provider: provider.name,
        model: provider.model,
        conversationId: context.thread.kind === "conversation" ? context.thread.conversationId : null,
        usage: null,
        durationMs: 0,
        status: "BLOCKED",
        errorCode: error.code
      });
    }
    throw error;
  }
  return { context, provider };
}

/** The provider must see a conversation that starts with the user and alternates roles. */
function normalizeTurns(history: EngineMessage[], message: string): EngineMessage[] {
  const turns: EngineMessage[] = [];
  for (const entry of history) {
    if (turns.length === 0 && entry.role !== "user") continue;
    const last = turns[turns.length - 1];
    if (last && last.role === entry.role) last.content = `${last.content}\n\n${entry.content}`;
    else turns.push({ ...entry });
  }
  // An unanswered user turn at the end (not possible with completed-turn saving, but be safe) is dropped.
  if (turns.length && turns[turns.length - 1].role === "user") turns.pop();
  const recent = turns.slice(-aiLimits.maxHistoryMessages());
  if (recent[0]?.role === "assistant") recent.shift();
  return [...recent, { role: "user", content: message }];
}

export async function* runAgent({ context, provider }: PreparedRun, signal: AbortSignal): AsyncGenerator<EngineEvent> {
  const agentEnum = AGENT_ENUM[context.agent];
  const started = Date.now();
  const existingConversation = context.thread.kind === "conversation" ? context.thread.conversationId : null;
  let usage: ProviderUsage | null = null;
  let model = provider.model;

  yield { type: "start", conversationId: existingConversation, provider: provider.name, model: provider.model };

  try {
    let text = "";
    let finalText: string | undefined;
    for await (const event of provider.stream({
      system: buildSystemPrompt(context),
      messages: normalizeTurns(context.history, context.message),
      maxOutputTokens: aiLimits.maxOutputTokens(),
      signal
    })) {
      if (event.type === "text") {
        text += event.text;
        yield { type: "delta", text: event.text };
      } else if (event.type === "reset") {
        text = "";
        yield { type: "reset" };
      } else {
        usage = event.usage;
        model = event.model;
        finalText = event.finalText;
      }
    }

    if (signal.aborted) throw new AiError("ai-cancelled");
    if (!usage) throw new AiError("ai-stream-interrupted", "provider ended without completion");
    const answer = (finalText ?? text).trim();
    if (!answer) throw new AiError("ai-empty-response");

    const sources = context.sources?.length ? markCitedSources(context.sources, answer) : undefined;
    const saved = await saveCompletedTurn(context, agentEnum, context.storedMessage ?? context.message, answer, sources);
    await recordUsage({
      userId: context.user.id,
      agent: agentEnum,
      provider: provider.name,
      model,
      conversationId: saved.conversationId,
      usage,
      durationMs: Date.now() - started,
      status: "SUCCESS"
    });
    yield { type: "done", conversationId: saved.conversationId, messages: saved.messages };
  } catch (error) {
    const aiError =
      error instanceof AiError
        ? error
        : signal.aborted
          ? new AiError("ai-cancelled")
          : new AiError("ai-provider-unavailable", error instanceof Error ? `${error.name}: ${error.message}` : "unknown");
    if (aiError.logDetail) console.error(`[ai-engine] ${context.agent} ${aiError.code}: ${aiError.logDetail}`);

    await recordUsage({
      userId: context.user.id,
      agent: agentEnum,
      provider: provider.name,
      model,
      conversationId: existingConversation,
      usage,
      durationMs: Date.now() - started,
      status: aiError.code === "ai-cancelled" ? "CANCELLED" : "FAILED",
      errorCode: aiError.code
    });
    yield { type: "error", code: aiError.code, message: aiError.message, retryable: aiError.retryable };
  }
}

/** Non-streaming use (the Student Tutor's JSON contract): runs the same pipeline and returns the result. */
export async function collectAgentRun(prepared: PreparedRun, signal: AbortSignal) {
  for await (const event of runAgent(prepared, signal)) {
    if (event.type === "done") return { ok: true as const, conversationId: event.conversationId, messages: event.messages };
    if (event.type === "error") return { ok: false as const, code: event.code, message: event.message, retryable: event.retryable };
  }
  return { ok: false as const, code: "ai-stream-interrupted", message: new AiError("ai-stream-interrupted").message, retryable: true };
}
