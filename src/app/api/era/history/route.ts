import { NextRequest } from "next/server";

import { createApiSuccessResponse } from "@/lib/app-errors";
import { requireId } from "@/lib/validation";
import { requireLessonAccess, requireStudentUser, toApiErrorResponse } from "@/server/authz";
import { getLessonThread } from "@/server/ai/conversations";

/**
 * The signed-in student's own conversation for one lesson. Ownership is the `userId` filter (taken from
 * the session); lesson access is re-checked so history disappears with access.
 */
export async function GET(request: NextRequest) {
  try {
    const currentUser = await requireStudentUser();
    const lessonId = requireId(request.nextUrl.searchParams.get("lesson_id"), "lesson_id");
    await requireLessonAccess(currentUser, lessonId, { studentsOnly: true });

    const messages = await getLessonThread(currentUser.id, lessonId, 40);
    return createApiSuccessResponse({ messages });
  } catch (error) {
    return toApiErrorResponse(error, {
      code: "history-unavailable",
      message: "ERA history is temporarily unavailable.",
      log: "era-history"
    });
  }
}
