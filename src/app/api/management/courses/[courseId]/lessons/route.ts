import type { NextRequest } from "next/server";

import { requireId, requireString } from "@/lib/validation";
import { handleManagementMutation } from "@/server/management/http";
import { addLesson, parseLessonUpdate } from "@/server/management/teaching";

type RouteProps = { params: Promise<{ courseId: string }> };

/** Add the next lesson to a course in the actor's scope. */
export async function POST(request: NextRequest, { params }: RouteProps) {
  const { courseId } = await params;
  return handleManagementMutation(
    request,
    async ({ actor, body }) => {
      const parsed = parseLessonUpdate({ ...body, title: requireString(body.title, "lesson title", { max: 160 }) });
      return addLesson(actor, requireId(courseId, "courseId"), { title: parsed.title!, taughtSummary: parsed.taughtSummary ?? null, homework: parsed.homework ?? null }, { source: "MANUAL" });
    },
    { status: 201 }
  );
}
