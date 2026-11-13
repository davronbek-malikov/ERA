import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { isValidId } from "@/lib/validation";
import { authErrors, requireAuthenticatedUser, requireLessonAccess, toApiErrorResponse } from "@/server/authz";
import { getLessonContextById } from "@/server/lessons";
import { resolvePlaybackUrl } from "@/server/storage";

type RouteProps = {
  params: Promise<{
    id: string;
  }>;
};

/** Lesson context for an authorized learner, owning teacher or admin. Never public. */
export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const user = await requireAuthenticatedUser();
    const { id } = await params;
    if (!isValidId(id)) throw authErrors.notFound("Lesson not found.");

    const { mode } = await requireLessonAccess(user, id);
    const lessonContext = await getLessonContextById(id, { includeDrafts: mode !== "student" });

    if (!lessonContext) {
      return createApiErrorResponse(404, "not-found", "Lesson not found.");
    }

    return createApiSuccessResponse({
      lesson: { ...lessonContext, lessonVideoUrl: await resolvePlaybackUrl(lessonContext.lessonVideoUrl) }
    });
  } catch (error) {
    return toApiErrorResponse(error, {
      code: "context-unavailable",
      message: "Lesson context is temporarily unavailable.",
      log: "lesson-context"
    });
  }
}
