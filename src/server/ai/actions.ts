import type { AiAgent, AiPendingAction, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { RequestError } from "@/lib/validation";
import type { ActionView } from "@/server/ai/types";
import { authErrors } from "@/server/authz";

/*
 * Pending AI actions (docs/ERA_STUDENT_MANAGEMENT.md, "AI assistant → Confirmation").
 *
 * The model can only PROPOSE a change. A proposal is stored here with a human-readable preview and shown with
 * Confirm / Cancel buttons. Nothing changes until its owner confirms it in the UI, and then:
 *   - the owner, the expiry and the PENDING status are checked;
 *   - the status moves PENDING → EXECUTING with a conditional update, so a double click, a retried request
 *     or two tabs can never run it twice;
 *   - the change runs with the user's CURRENT permissions (re-checked by the management services), with the
 *     action id as idempotency key;
 *   - the outcome (EXECUTED / FAILED) is stored, and a short result message is added to the conversation.
 */

export const ACTION_TTL_MS = 30 * 60 * 1000;

export type ActionPreview = { title: string; lines: Array<{ label: string; value: string }>; warnings: string[] };

export function toActionView(row: Pick<AiPendingAction, "id" | "kind" | "preview" | "status" | "result" | "error" | "expiresAt">): ActionView {
  const preview = (row.preview ?? {}) as unknown as Partial<ActionPreview>;
  const expired = row.status === "PENDING" && row.expiresAt.getTime() < Date.now();
  const result = (row.result ?? null) as { message?: string } | null;
  return {
    id: row.id,
    kind: row.kind,
    title: preview.title ?? "Proposed change",
    lines: Array.isArray(preview.lines) ? preview.lines : [],
    warnings: Array.isArray(preview.warnings) ? preview.warnings : [],
    status: expired ? "EXPIRED" : row.status,
    resultMessage: result?.message ?? row.error ?? null,
    expiresAt: row.expiresAt.toISOString()
  };
}

export const ACTION_VIEW_SELECT = { id: true, kind: true, preview: true, status: true, result: true, error: true, expiresAt: true } as const;

export async function createPendingAction(input: {
  userId: string;
  agent: AiAgent;
  conversationId: string | null;
  kind: string;
  payload: Record<string, unknown>;
  preview: ActionPreview;
}): Promise<ActionView> {
  const row = await prisma.aiPendingAction.create({
    data: {
      userId: input.userId,
      agent: input.agent,
      conversationId: input.conversationId,
      kind: input.kind,
      payload: input.payload as Prisma.InputJsonValue,
      preview: input.preview as unknown as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + ACTION_TTL_MS)
    },
    select: ACTION_VIEW_SELECT
  });
  return toActionView(row);
}

/** Proposals of a run that failed or was cancelled: never confirmable. */
export async function abandonActions(userId: string, ids: string[]) {
  if (!ids.length) return;
  await prisma.aiPendingAction.updateMany({
    where: { id: { in: ids }, userId, status: "PENDING", messageId: null },
    data: { status: "CANCELLED", decidedAt: new Date(), error: "The answer that proposed this was not completed." }
  });
}

/** Attach a run's proposals to the saved assistant message (inside the turn's transaction). */
export async function linkActionsToMessage(tx: Prisma.TransactionClient, userId: string, ids: string[], messageId: string, conversationId: string | null) {
  if (!ids.length) return [];
  await tx.aiPendingAction.updateMany({ where: { id: { in: ids }, userId, messageId: null }, data: { messageId, conversationId } });
  const rows = await tx.aiPendingAction.findMany({ where: { id: { in: ids }, userId }, orderBy: { createdAt: "asc" }, select: ACTION_VIEW_SELECT });
  return rows.map(toActionView);
}

export type ActionExecutor = (action: { id: string; kind: string; payload: Record<string, unknown>; agent: AiAgent }) => Promise<{ message: string; data?: unknown }>;

export async function decidePendingAction(userId: string, actionId: string, decision: "confirm" | "cancel", execute: ActionExecutor): Promise<ActionView> {
  const action = await prisma.aiPendingAction.findFirst({ where: { id: actionId, userId } });
  if (!action) throw authErrors.notFound("Action not found.");

  if (action.status !== "PENDING") return toActionView(action); // already decided: report, never repeat
  if (action.expiresAt.getTime() < Date.now()) {
    await prisma.aiPendingAction.updateMany({ where: { id: action.id, status: "PENDING" }, data: { status: "EXPIRED", decidedAt: new Date() } });
    throw new RequestError(409, "action-expired", "This proposal has expired. Ask the assistant again.");
  }

  if (decision === "cancel") {
    await prisma.aiPendingAction.updateMany({ where: { id: action.id, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } });
    return toActionView(await prisma.aiPendingAction.findUniqueOrThrow({ where: { id: action.id }, select: ACTION_VIEW_SELECT }));
  }

  // Claim it: exactly one request wins the PENDING → EXECUTING transition.
  const claimed = await prisma.aiPendingAction.updateMany({ where: { id: action.id, status: "PENDING" }, data: { status: "EXECUTING", decidedAt: new Date() } });
  if (claimed.count !== 1) {
    return toActionView(await prisma.aiPendingAction.findUniqueOrThrow({ where: { id: action.id }, select: ACTION_VIEW_SELECT }));
  }

  try {
    const outcome = await execute({ id: action.id, kind: action.kind, payload: action.payload as Record<string, unknown>, agent: action.agent });
    const row = await prisma.aiPendingAction.update({
      where: { id: action.id },
      data: { status: "EXECUTED", result: JSON.parse(JSON.stringify({ message: outcome.message, data: outcome.data ?? null })) },
      select: ACTION_VIEW_SELECT
    });
    await appendResultMessage(action, `✅ ${outcome.message}`);
    return toActionView(row);
  } catch (error) {
    const message = error instanceof RequestError ? error.message : "The change could not be completed. Nothing was saved.";
    if (!(error instanceof RequestError)) console.error(`[ai-actions] ${action.kind} failed: ${error instanceof Error ? error.message : String(error)}`);
    const row = await prisma.aiPendingAction.update({ where: { id: action.id }, data: { status: "FAILED", error: message }, select: ACTION_VIEW_SELECT });
    await appendResultMessage(action, `⚠️ Not done: ${message}`);
    return toActionView(row);
  }
}

/** Keeps the conversation (and the model's later context) aware of what actually happened. */
async function appendResultMessage(action: AiPendingAction, content: string) {
  if (!action.conversationId) return;
  await prisma.chatMessage
    .create({ data: { userId: action.userId, agent: action.agent, conversationId: action.conversationId, role: "ASSISTANT", content } })
    .catch(() => undefined);
  await prisma.aiConversation.updateMany({ where: { id: action.conversationId, userId: action.userId }, data: { updatedAt: new Date() } }).catch(() => undefined);
}
