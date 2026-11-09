import { UserRole } from "@prisma/client";

import { aiLimits } from "@/server/ai/config";
import { saveCompletedTurn } from "@/server/ai/conversations";
import { AiError } from "@/server/ai/errors";
import { markCitedSources } from "@/server/ai/knowledge";
import { buildSystemPrompt } from "@/server/ai/prompts";
import { getProvider } from "@/server/ai/providers";
import type {
  ActionView,
  AgentKind,
  AiProvider,
  EngineEvent,
  EngineMessage,
  ExecutionContext,
  ProviderEvent,
  ProviderMessage,
  ProviderUsage,
  ToolResult
} from "@/server/ai/types";
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

/** Upper bound on model ↔ tool round trips in one answer (each step is a full provider request). */
const MAX_TOOL_STEPS = 6;
/** Blank line between the texts of two tool steps. */
const PARAGRAPH_BREAK = String.fromCharCode(10, 10);

function addUsage(total: ProviderUsage | null, step: ProviderUsage): ProviderUsage {
  if (!total) return { ...step };
  const sum = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
  return {
    inputTokens: sum(total.inputTokens, step.inputTokens),
    outputTokens: sum(total.outputTokens, step.outputTokens),
    source: total.source === "provider" && step.source === "provider" ? "provider" : "unavailable"
  };
}

export async function* runAgent({ context, provider }: PreparedRun, signal: AbortSignal): AsyncGenerator<EngineEvent> {
  const agentEnum = AGENT_ENUM[context.agent];
  const started = Date.now();
  const existingConversation = context.thread.kind === "conversation" ? context.thread.conversationId : null;
  let usage: ProviderUsage | null = null;
  let model = provider.model;
  const tools = context.tools;
  const actions: ActionView[] = [];

  yield { type: "start", conversationId: existingConversation, provider: provider.name, model: provider.model };

  try {
    const system = buildSystemPrompt(context);
    const transcript: ProviderMessage[] = normalizeTurns(context.history, context.message);
    let answerText = "";
    let completed = false;

    for (let step = 0; step < (tools ? MAX_TOOL_STEPS : 1); step += 1) {
      let stepText = "";
      let finalText: string | undefined;
      let stepDone: Extract<ProviderEvent, { type: "done" }> | null = null;

      for await (const event of provider.stream({
        system,
        messages: transcript,
        maxOutputTokens: aiLimits.maxOutputTokens(),
        signal,
        ...(tools ? { tools: tools.definitions } : {})
      })) {
        if (event.type === "text") {
          // Separate the text of a later step from what was already shown.
          if (!stepText && answerText) yield { type: "delta", text: PARAGRAPH_BREAK };
          stepText += event.text;
          yield { type: "delta", text: event.text };
        } else if (event.type === "reset") {
          answerText = "";
          stepText = "";
          yield { type: "reset" };
        } else {
          stepDone = event;
          usage = addUsage(usage, event.usage);
          model = event.model;
          finalText = event.finalText;
        }
      }

      if (signal.aborted) throw new AiError("ai-cancelled");
      if (!stepDone) throw new AiError("ai-stream-interrupted", "provider ended without completion");
      const text = (finalText ?? stepText).trim();
      if (text) answerText = answerText ? `${answerText}${PARAGRAPH_BREAK}${text}` : text;

      const calls = tools && stepDone.stopReason === "tool_use" ? (stepDone.toolCalls ?? []) : [];
      if (!calls.length) {
        completed = true;
        break;
      }

      transcript.push({ role: "assistant", content: text, toolCalls: calls, raw: stepDone.raw });
      const results: ToolResult[] = [];
      for (const call of calls) {
        yield { type: "tool", name: call.name, label: tools!.label(call.name) };
        const outcome = await tools!.execute(call);
        if (outcome.action) {
          actions.push(outcome.action);
          yield { type: "action", action: outcome.action };
        }
        results.push({ toolCallId: call.id, name: call.name, content: outcome.content, ...(outcome.isError ? { isError: true } : {}) });
      }
      transcript.push({ role: "tool", results });
    }

    if (!usage) throw new AiError("ai-stream-interrupted", "provider ended without completion");
    if (!completed && !answerText) answerText = "I couldn't finish looking that up. Please ask again with more detail.";
    if (!answerText && actions.length) answerText = "Please review the proposed change below and confirm it if it's correct.";
    const answer = answerText.trim();
    if (!answer) throw new AiError("ai-empty-response");

    const sources = context.sources?.length ? markCitedSources(context.sources, answer) : undefined;
    const saved = await saveCompletedTurn(
      context,
      agentEnum,
      context.storedMessage ?? context.message,
      answer,
      sources,
      actions.map((action) => action.id)
    );
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
    // Proposals from an answer that wasn't saved must not stay confirmable.
    if (tools) await tools.abandon().catch(() => undefined);

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
