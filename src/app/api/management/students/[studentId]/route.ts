import type { NextRequest } from "next/server";

import { requireId } from "@/lib/validation";
import { handleManagementQuery } from "@/server/management/http";
import { getStudentProfile } from "@/server/management/queries";

type RouteProps = { params: Promise<{ studentId: string }> };

/**
 * One student's management profile as JSON (enrollments, history, payments, access log, exams, notes), scoped
 * exactly like the profile page: teachers only see their assigned enrollments; money only with permission.
 */
export async function GET(request: NextRequest, { params }: RouteProps) {
  const { studentId } = await params;
  return handleManagementQuery(request, async ({ actor }) => ({ profile: await getStudentProfile(actor, requireId(studentId, "studentId")) }));
}
