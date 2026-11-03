import { NextRequest } from "next/server";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { isPracticeLanguage } from "@/lib/practice-languages";
import { submitPracticeExercise } from "@/server/practice";

type RouteProps = {
  params: Promise<{
    exerciseId: string;
  }>;
};

export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    const { exerciseId } = await params;
    const body = (await request.json()) as {
      code?: string;
      language?: string;
    };

    if (!body.code?.trim()) {
      return createApiErrorResponse(400, "missing-code", "Enter code before submitting.");
    }

    if (!body.language || !isPracticeLanguage(body.language)) {
      return createApiErrorResponse(400, "invalid-language", "Choose a supported coding language.");
    }

    const result = await submitPracticeExercise({
      exerciseId,
      code: body.code,
      language: body.language
    });

    return createApiSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Practice submission failed.";
    const status = message.includes("Sign in") ? 401 : message.includes("not found") ? 404 : 400;
    return createApiErrorResponse(status, "practice-submit-failed", message);
  }
}
