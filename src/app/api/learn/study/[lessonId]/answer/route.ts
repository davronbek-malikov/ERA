import type { NextRequest } from "next/server";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { assertRateLimit, getUserRateLimitKeyParts, RateLimitError } from "@/lib/rate-limit";
import { readJsonObject, requireId, requireString } from "@/lib/validation";
import { assertSameOrigin, requireAuthenticatedUser, toApiErrorResponse } from "@/server/authz";
import { isStudyLanguage } from "@/server/study/content";
import { answerStudyQuestion } from "@/server/study/service";

type RouteProps = { params: Promise<{ lessonId: string }> };

export const maxDuration = 60;

/** Test yourself / checkpoints: grades one answer (choice instantly, written answers by AI with a follow-up). */
export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const lessonId = requireId((await params).lessonId, "lessonId");
    const body = await readJsonObject(request, 16 * 1024);
    const questionId = requireString(body.questionId, "questionId", { max: 60 });
    const choice = typeof body.choice === "number" && Number.isInteger(body.choice) ? body.choice : null;
    const answer = typeof body.answer === "string" ? body.answer.slice(0, 4000) : null;
    const followUp = typeof body.followUp === "string" && body.followUp.trim() ? body.followUp.trim().slice(0, 500) : null;
    const language = isStudyLanguage(body.language) ? body.language : "uz";
    try {
      await assertRateLimit({ scope: "study-answer", maxAttempts: 80, windowMs: 10 * 60_000, cooldownMs: 5 * 60_000, keyParts: getUserRateLimitKeyParts(user.id) });
    } catch (error) {
      if (error instanceof RateLimitError) return createApiErrorResponse(429, "rate-limited", "Too many answers in a short time. Please wait a few minutes.");
      throw error;
    }
    return createApiSuccessResponse(await answerStudyQuestion(user, lessonId, { questionId, choice, answer, language, followUp }));
  } catch (error) {
    return toApiErrorResponse(error, { code: "answer-failed", message: "Your answer couldn't be checked right now. Please try again.", log: "study-answer" });
  }
}
