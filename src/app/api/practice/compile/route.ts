import { NextRequest } from "next/server";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { getCurrentUser } from "@/lib/auth";
import { isPracticeLanguage } from "@/lib/practice-languages";
import { assertRateLimit, getRequestRateLimitKeyParts, RateLimitError } from "@/lib/rate-limit";
import { compilePracticeCode, MAX_PRACTICE_CODE_LENGTH } from "@/server/practice";

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return createApiErrorResponse(401, "auth-required", "Sign in to run practice checks.");
  }

  try {
    const body = (await request.json()) as {
      code?: string;
      language?: string;
    };

    if (!body.code?.trim()) {
      return createApiErrorResponse(400, "missing-code", "Enter code before submitting.");
    }

    if (body.code.length > MAX_PRACTICE_CODE_LENGTH) {
      return createApiErrorResponse(400, "code-too-long", "This code is too long to check.");
    }

    if (!body.language || !isPracticeLanguage(body.language)) {
      return createApiErrorResponse(400, "invalid-language", "Choose a supported coding language.");
    }

    await assertRateLimit({
      scope: "practice-compile",
      maxAttempts: 30,
      windowMs: 60_000,
      cooldownMs: 60_000,
      keyParts: await getRequestRateLimitKeyParts(currentUser.id)
    });

    return createApiSuccessResponse({
      script: compilePracticeCode(body.language, body.code)
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return createApiErrorResponse(
        429,
        "rate-limited",
        `Too many checks. Please wait ${error.retryAfterSeconds} seconds and try again.`
      );
    }

    return createApiErrorResponse(
      400,
      "practice-compile-failed",
      error instanceof Error ? error.message : "The code could not be prepared."
    );
  }
}
