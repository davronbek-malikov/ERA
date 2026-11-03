import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { getLessonContextById } from "@/server/lessons";

type RouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const lessonContext = await getLessonContextById(id);

    if (!lessonContext) {
      return createApiErrorResponse(404, "lesson-not-found", "Lesson context not found.");
    }

    return createApiSuccessResponse({
      lesson: lessonContext
    });
  } catch {
    return createApiErrorResponse(
      503,
      "context-unavailable",
      "Lesson context is temporarily unavailable.",
      { retryable: true }
    );
  }
}
