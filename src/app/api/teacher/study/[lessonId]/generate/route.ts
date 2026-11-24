import type { NextRequest } from "next/server";

import { createApiSuccessResponse } from "@/lib/app-errors";
import { assertRateLimit, getUserRateLimitKeyParts } from "@/lib/rate-limit";
import { invalid, readJsonObject, requireId } from "@/lib/validation";
import { assertSameOrigin, requireAuthenticatedUser, toApiErrorResponse } from "@/server/authz";
import { GENERATION_STEPS, type GenerationStep } from "@/server/study/generate";
import { requireTeacherLesson, runGenerationStep } from "@/server/study/service";

type RouteProps = { params: Promise<{ lessonId: string }> };

// Writing a whole lesson with AI can take a few minutes.
export const maxDuration = 300;

/** Runs one generation step: "chapter", "questions" or "english". The page calls them one after another. */
export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const lessonId = requireId((await params).lessonId, "lessonId");
    await requireTeacherLesson(user, lessonId);
    const body = await readJsonObject(request, 1024);
    const step = body.step as GenerationStep;
    if (!GENERATION_STEPS.includes(step)) throw invalid("invalid-step", "Unknown generation step.");
    await assertRateLimit({ scope: "study-generate", maxAttempts: 40, windowMs: 60 * 60_000, cooldownMs: 15 * 60_000, keyParts: getUserRateLimitKeyParts(user.id) });
    return createApiSuccessResponse(await runGenerationStep(user, lessonId, step));
  } catch (error) {
    return toApiErrorResponse(error, { code: "generation-failed", message: "The AI couldn't write this part. Please try again.", log: "study-generate" });
  }
}
