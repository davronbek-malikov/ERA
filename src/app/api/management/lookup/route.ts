import type { NextRequest } from "next/server";

import { requireId } from "@/lib/validation";
import { handleManagementQuery } from "@/server/management/http";
import { listCourseEnrollments, searchStudentAccounts } from "@/server/management/queries";

/**
 * Small lookups for the management forms:
 *   ?type=students&q=…          student accounts (scope rules in searchStudentAccounts)
 *   ?type=course-students&courseId=…   active enrollments of one course (exam participants)
 */
export async function GET(request: NextRequest) {
  return handleManagementQuery(request, async ({ actor }) => {
    const params = request.nextUrl.searchParams;
    if (params.get("type") === "course-students") {
      return { enrollments: await listCourseEnrollments(actor, requireId(params.get("courseId"), "courseId")) };
    }
    return { students: await searchStudentAccounts(actor, (params.get("q") ?? "").slice(0, 100)) };
  });
}
