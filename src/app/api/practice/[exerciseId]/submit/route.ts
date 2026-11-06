import { NextRequest } from "next/server";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { isPracticeLanguage } from "@/lib/practice-languages";
import { assertRateLimit, getUserRateLimitKeyParts } from "@/lib/rate-limit";
import { isValidId, readJsonObject } from "@/lib/validation";
import { assertSameOrigin, authErrors, requireAuthenticatedUser, toApiErrorResponse } from "@/server/authz";
import { MAX_PRACTICE_CODE_LENGTH, submitPracticeExercise } from "@/server/practice";

type RouteProps = {
  params: Promise<{
    exerciseId: string;
  }>;
};

function isResultList(value: unknown): value is Array<{ passed: boolean; actual: unknown }> {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every(
      (item) => typeof item === "object" && item !== null && typeof (item as { passed?: unknown }).passed === "boolean"
    )
  );
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    assertSameOrigin(request);
    const currentUser = await requireAuthenticatedUser();
    const { exerciseId } = await params;
    if (!isValidId(exerciseId)) throw authErrors.notFound("Practice exercise not found.");

    const body = await readJsonObject(request, MAX_PRACTICE_CODE_LENGTH * 4 + 64 * 1024);
    const code = typeof body.code === "string" ? body.code : "";
    const language = typeof body.language === "string" ? body.language : "";

    if (!code.trim()) {
      return createApiErrorResponse(400, "missing-code", "Enter code before submitting.");
    }

    if (code.length > MAX_PRACTICE_CODE_LENGTH) {
      return createApiErrorResponse(400, "code-too-long", "This code is too long to check.");
    }

    if (!isPracticeLanguage(language)) {
      return createApiErrorResponse(400, "invalid-language", "Choose a supported coding language.");
    }

    if (!isResultList(body.results)) {
      return createApiErrorResponse(400, "invalid-results", "Run the checks before submitting.");
    }

    await assertRateLimit({
      scope: "practice-submit",
      maxAttempts: 30,
      windowMs: 60_000,
      cooldownMs: 60_000,
      keyParts: getUserRateLimitKeyParts(currentUser.id)
    });

    const result = await submitPracticeExercise(currentUser, {
      exerciseId,
      code,
      language,
      results: body.results
    });

    return createApiSuccessResponse(result);
  } catch (error) {
    return toApiErrorResponse(error, {
      code: "practice-submit-failed",
      message: "Practice submission failed. Please try again.",
      log: "practice-submit"
    });
  }
}
