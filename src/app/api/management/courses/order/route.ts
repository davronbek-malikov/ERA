import type { NextRequest } from "next/server";

import { handleManagementMutation } from "@/server/management/http";
import { parseCourseOrder, reorderCourses } from "@/server/management/teaching";

/** Save the order of the teacher's courses: { courseIds: [...] } in the new order. */
export async function PUT(request: NextRequest) {
  return handleManagementMutation(request, async ({ actor, body }) => reorderCourses(actor, parseCourseOrder(body), { source: "MANUAL" }));
}
