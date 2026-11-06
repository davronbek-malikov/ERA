import type { AiAgent, Prisma } from "@prisma/client";

import type { KnowledgeSource } from "@/server/ai/knowledge";

import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { conversationTitle } from "@/server/ai/prompts";
import type { EngineMessage, ExecutionContext } from "@/server/ai/types";
import { authErrors } from "@/server/authz";

/*
 * Conversation manager (docs/ERA_AI_ARCHITECTURE.md §8).
 * - Student Tutor: one thread per (student, lesson), stored in ChatMessage exactly as before Prompt 08.
 * - Teacher / Admin: AiConversation rows owned by one user; messages reference the conversation.
 * Ownership is always the session user's id. A conversation that isn't yours is "not found".
 * A turn (user question + assistant answer) is written in ONE transaction and only after the answer
 * completed, so a failed or cancelled stream never leaves a half-saved exchange.
 */

export type StoredMessage = { id: string; role: "USER" | "ASSISTANT"; content: string; createdAt: string; sources?: KnowledgeSource[] };

function toStored(message: { id: string; role: "USER" | "ASSISTANT"; content: string; createdAt: Date; sources?: Prisma.JsonValue | null }): StoredMessage {
  const sources = Array.isArray(message.sources) ? (message.sources as unknown as KnowledgeSource[]) : undefined;
  return { id: message.id, role: message.role, content: message.content, createdAt: message.createdAt.toISOString(), ...(sources?.length ? { sources } : {}) };
}

function toEngine(messages: Array<{ role: "USER" | "ASSISTANT"; content: string }>): EngineMessage[] {
  return messages.map((message) => ({ role: message.role === "USER" ? "user" : "assistant", content: message.content }));
}

/** Last `limit` messages of the student's own lesson thread, oldest first. */
export async function getLessonThread(userId: string, lessonId: string, limit: number) {
  const rows = await retryOnDatabaseFailure(() =>
    prisma.chatMessage.findMany({
      where: { userId, lessonId, agent: "STUDENT_TUTOR", conversationId: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, role: true, content: true, createdAt: true, sources: true }
    })
  );
  return rows.reverse().map(toStored);
}

export async function getLessonHistoryForModel(userId: string, lessonId: string, limit: number) {
  return toEngine(await getLessonThread(userId, lessonId, limit));
}

/** The user's own conversation for this agent, or a 404. */
export async function requireOwnedConversation(userId: string, conversationId: string, agent: AiAgent) {
  const conversation = await retryOnDatabaseFailure(() =>
    prisma.aiConversation.findFirst({
      where: { id: conversationId, userId, agent },
      select: { id: true, title: true, courseId: true }
    })
  );
  if (!conversation) throw authErrors.notFound("Conversation not found.");
  return conversation;
}

export async function listConversations(userId: string, agent: AiAgent) {
  const rows = await retryOnDatabaseFailure(() =>
    prisma.aiConversation.findMany({
      where: { userId, agent },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, title: true, courseId: true, updatedAt: true }
    })
  );
  return rows.map((row) => ({ id: row.id, title: row.title, courseId: row.courseId, updatedAt: row.updatedAt.toISOString() }));
}

export async function getConversationMessages(userId: string, conversationId: string, agent: AiAgent, limit = 100) {
  const conversation = await requireOwnedConversation(userId, conversationId, agent);
  const rows = await retryOnDatabaseFailure(() =>
    prisma.chatMessage.findMany({
      where: { conversationId: conversation.id, userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, role: true, content: true, createdAt: true, sources: true }
    })
  );
  return { conversation, messages: rows.reverse().map(toStored) };
}

export async function getConversationHistoryForModel(userId: string, conversationId: string, agent: AiAgent, limit: number) {
  const { messages } = await getConversationMessages(userId, conversationId, agent, limit);
  return toEngine(messages);
}

/** Persists one completed exchange. Creates the conversation on its first turn. */
export async function saveCompletedTurn(context: ExecutionContext, agent: AiAgent, question: string, answer: string, sources?: KnowledgeSource[]) {
  const sourceData = sources?.length ? { sources: sources as unknown as Prisma.InputJsonValue } : {};
  return retryOnDatabaseFailure(() =>
    prisma.$transaction(async (tx) => {
      const userId = context.user.id;

      if (context.thread.kind === "lesson") {
        const base = { userId, agent, courseId: context.thread.courseId, lessonId: context.thread.lessonId };
        const user = await tx.chatMessage.create({ data: { ...base, role: "USER", content: question } });
        const assistant = await tx.chatMessage.create({ data: { ...base, role: "ASSISTANT", content: answer, ...sourceData } });
        return { conversationId: null, messages: [toStored(user), toStored(assistant)] };
      }

      let conversationId = context.thread.conversationId;
      if (conversationId) {
        // Re-check ownership inside the transaction; touch updatedAt for ordering.
        const updated = await tx.aiConversation.updateMany({ where: { id: conversationId, userId, agent }, data: { updatedAt: new Date() } });
        if (updated.count !== 1) throw authErrors.notFound("Conversation not found.");
      } else {
        const created = await tx.aiConversation.create({
          data: { userId, agent, title: conversationTitle(context.thread.title), courseId: context.thread.courseId },
          select: { id: true }
        });
        conversationId = created.id;
      }

      const base = { userId, agent, conversationId, courseId: context.thread.courseId };
      const user = await tx.chatMessage.create({ data: { ...base, role: "USER", content: question } });
      const assistant = await tx.chatMessage.create({ data: { ...base, role: "ASSISTANT", content: answer, ...sourceData } });
      return { conversationId, messages: [toStored(user), toStored(assistant)] };
    })
  );
}
