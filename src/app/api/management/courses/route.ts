import type { NextRequest } from "next/server";

import { handleManagementMutation } from "@/server/management/http";
import { createCourseWithLessons, parseCourse } from "@/server/management/teaching";

/** Create a course with its lessons (what was taught + homework). Teachers create their own courses. */
export async function POST(request: NextRequest) {
  return handleManagementMutation(request, async ({ actor, body }) => createCourseWithLessons(actor, parseCourse(body), { source: "MANUAL" }), { status: 201 });
}
