import type { NextRequest } from "next/server";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { assertRateLimit, getUserRateLimitKeyParts, RateLimitError } from "@/lib/rate-limit";
import { readJsonObject, requireId, requireString } from "@/lib/validation";
import { assertSameOrigin, requireAuthenticatedUser, toApiErrorResponse } from "@/server/authz";
import { isStudyLanguage } from "@/server/study/content";
import { askStudyQuestion } from "@/server/study/service";

type RouteProps = { params: Promise<{ lessonId: string }> };

export const maxDuration = 120;

/** "Ask a question" in the study room: smart search + cache first, AI only when needed. */
export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const lessonId = requireId((await params).lessonId, "lessonId");
    const body = await readJsonObject(request, 16 * 1024);
    const question = requireString(body.question, "question", { min: 2, max: 1000 });
    const selection = typeof body.selection === "string" && body.selection.trim() ? body.selection.trim().slice(0, 2000) : null;
    const language = isStudyLanguage(body.language) ? body.language : "uz";
    try {
      await assertRateLimit({ scope: "study-ask", maxAttempts: 20, windowMs: 10 * 60_000, cooldownMs: 5 * 60_000, keyParts: getUserRateLimitKeyParts(user.id) });
    } catch (error) {
      if (error instanceof RateLimitError) return createApiErrorResponse(429, "rate-limited", "You're asking very fast. Please wait a few minutes.");
      throw error;
    }
    const mode = body.mode === "explain" ? "explain" : "ask";
    return createApiSuccessResponse(await askStudyQuestion(user, lessonId, { question, selection, language, mode }));
  } catch (error) {
    return toApiErrorResponse(error, { code: "ask-failed", message: "ERA couldn't answer right now. Please try again in a moment.", log: "study-ask" });
  }
}
