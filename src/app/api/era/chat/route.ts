import { NextRequest } from "next/server";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { getCurrentUser } from "@/lib/auth";
import { generateEraAnswer } from "@/lib/era/provider";
import { getRequestRateLimitKeyParts, RateLimitError, assertRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { getLessonContextById, getRecentLessonChatMessages } from "@/server/lessons";

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return createApiErrorResponse(401, "auth-required", "Sign in to chat with ERA.");
  }

  try {
    const { lessonId, question } = (await request.json()) as {
      lessonId?: string;
      question?: string;
    };

    const normalizedLessonId = lessonId?.trim();
    const normalizedQuestion = question?.trim();

    if (!normalizedLessonId || !normalizedQuestion) {
      return createApiErrorResponse(400, "invalid-payload", "Lesson ID and question are required.");
    }

    if (normalizedQuestion.length > 3000) {
      return createApiErrorResponse(400, "question-too-long", "Questions must be 3000 characters or less.");
    }

    const rateLimitKeyParts = await getRequestRateLimitKeyParts(currentUser.id);
    await assertRateLimit({
      scope: "era-chat",
      maxAttempts: 8,
      windowMs: 60_000,
      cooldownMs: 90_000,
      keyParts: rateLimitKeyParts
    });

    const lessonContext = await getLessonContextById(normalizedLessonId);

    if (!lessonContext) {
      return createApiErrorResponse(404, "lesson-not-found", "Lesson context not found.");
    }

    const history = await getRecentLessonChatMessages(currentUser.id, normalizedLessonId);
    const answer = await generateEraAnswer({
      question: normalizedQuestion,
      lessonContext,
      history
    });

    const [userMessage, assistantMessage] = await retryOnDatabaseFailure(() =>
      prisma.$transaction([
        prisma.chatMessage.create({
          data: {
            userId: currentUser.id,
            courseId: lessonContext.courseId,
            lessonId: lessonContext.lessonId,
            role: "USER",
            content: normalizedQuestion
          }
        }),
        prisma.chatMessage.create({
          data: {
            userId: currentUser.id,
            courseId: lessonContext.courseId,
            lessonId: lessonContext.lessonId,
            role: "ASSISTANT",
            content: answer
          }
        })
      ])
    );

    return createApiSuccessResponse({
      answer,
      messages: [
        {
          id: userMessage.id,
          role: userMessage.role,
          content: userMessage.content,
          createdAt: userMessage.createdAt.toISOString()
        },
        {
          id: assistantMessage.id,
          role: assistantMessage.role,
          content: assistantMessage.content,
          createdAt: assistantMessage.createdAt.toISOString()
        }
      ]
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return createApiErrorResponse(
        429,
        "rate-limited",
        `Too many ERA requests. Please wait ${error.retryAfterSeconds} seconds and try again.`
      );
    }

    return createApiErrorResponse(
      503,
      "era-unavailable",
      error instanceof Error ? error.message : "ERA is temporarily unavailable.",
      { retryable: true }
    );
  }
}
