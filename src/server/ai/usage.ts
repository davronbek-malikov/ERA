import { Prisma, type AiAgent, type AiUsageStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { assertRateLimit, getUserRateLimitKeyParts } from "@/lib/rate-limit";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { aiLimits, getModelPrice } from "@/server/ai/config";
import { AiError } from "@/server/ai/errors";
import type { AgentKind, ProviderUsage } from "@/server/ai/types";

/*
 * Usage and cost tracking (docs/ERA_AI_USAGE_TRACKING.md). Every record is created by the server from the
 * provider's own response; nothing a client sends is used. Cost is computed only from provider-reported
 * tokens and a known price, otherwise it is stored as null.
 */

function startOfUtcDay() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Server-side limits, checked before any provider call:
 *  1. burst: N requests per minute per user (in-memory, per instance);
 *  2. daily requests per user and agent (database);
 *  3. daily provider-reported tokens per user across agents (database).
 * Throws RateLimitError (1) or AiError("ai-limit-reached") (2, 3).
 */
export async function assertUsageAllowed(userId: string, agent: AgentKind, agentEnum: AiAgent) {
  await assertRateLimit({
    scope: `ai-${agent}`,
    maxAttempts: aiLimits.perMinute(),
    windowMs: 60_000,
    cooldownMs: 60_000,
    keyParts: getUserRateLimitKeyParts(userId)
  });

  const since = startOfUtcDay();
  const [requests, tokens] = await retryOnDatabaseFailure(() =>
    Promise.all([
      prisma.aiUsageEvent.count({ where: { userId, agent: agentEnum, createdAt: { gte: since }, status: { not: "BLOCKED" } } }),
      prisma.aiUsageEvent.aggregate({ where: { userId, createdAt: { gte: since } }, _sum: { inputTokens: true, outputTokens: true } })
    ])
  );
  const usedTokens = (tokens._sum.inputTokens ?? 0) + (tokens._sum.outputTokens ?? 0);

  if (requests >= aiLimits.dailyRequests(agent) || usedTokens >= aiLimits.dailyTokens()) {
    throw new AiError("ai-limit-reached", `daily limit: ${requests} requests, ${usedTokens} tokens`);
  }
}

export function estimateCostUsd(model: string, usage: ProviderUsage): Prisma.Decimal | null {
  if (usage.source !== "provider" || usage.inputTokens === null || usage.outputTokens === null) return null;
  const price = getModelPrice(model);
  if (!price) return null;
  const cost = (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
  return new Prisma.Decimal(cost.toFixed(6));
}

export async function recordUsage(event: {
  userId: string;
  agent: AiAgent;
  provider: string;
  model: string;
  conversationId: string | null;
  usage: ProviderUsage | null;
  durationMs: number;
  status: AiUsageStatus;
  errorCode?: string;
}) {
  try {
    await prisma.aiUsageEvent.create({
      data: {
        userId: event.userId,
        agent: event.agent,
        provider: event.provider,
        model: event.model,
        conversationId: event.conversationId,
        inputTokens: event.usage?.inputTokens ?? null,
        outputTokens: event.usage?.outputTokens ?? null,
        usageSource: event.usage?.source ?? "unavailable",
        estimatedCostUsd: event.usage ? estimateCostUsd(event.model, event.usage) : null,
        durationMs: Math.max(0, Math.round(event.durationMs)),
        status: event.status,
        errorCode: event.errorCode ?? null
      }
    });
  } catch (error) {
    // Usage logging must never break an answer the user already received.
    console.error(`[ai-usage] could not record usage: ${error instanceof Error ? error.name : "unknown"}`);
  }
}
