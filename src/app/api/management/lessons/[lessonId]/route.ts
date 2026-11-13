import type { NextRequest } from "next/server";

import { requireId } from "@/lib/validation";
import { handleManagementMutation } from "@/server/management/http";
import { parseLessonUpdate, updateLesson } from "@/server/management/teaching";

type RouteProps = { params: Promise<{ lessonId: string }> };

/** Edit a lesson's title, what was taught, or its homework. */
export async function PATCH(request: NextRequest, { params }: RouteProps) {
  const { lessonId } = await params;
  return handleManagementMutation(request, async ({ actor, body }) => updateLesson(actor, requireId(lessonId, "lessonId"), parseLessonUpdate(body), { source: "MANUAL" }));
}
