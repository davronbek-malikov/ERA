import { NextRequest } from "next/server";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { getCurrentUser } from "@/lib/auth";
import { getLessonChatHistory } from "@/server/lessons";

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return createApiErrorResponse(401, "auth-required", "Sign in to view ERA history.");
  }

  const lessonId = request.nextUrl.searchParams.get("lesson_id")?.trim();

  if (!lessonId) {
    return createApiErrorResponse(400, "missing-lesson-id", "lesson_id is required.");
  }

  try {
    const messages = await getLessonChatHistory(currentUser.id, lessonId);
    return createApiSuccessResponse({ messages });
  } catch {
    return createApiErrorResponse(
      503,
      "history-unavailable",
      "ERA history is temporarily unavailable.",
      { retryable: true }
    );
  }
}
