import type { NextRequest } from "next/server";

import { requireId } from "@/lib/validation";
import { changeEnrollmentAccess } from "@/server/management/enrollments";
import { handleManagementMutation } from "@/server/management/http";
import { parseAccessChange } from "@/server/management/inputs";

type RouteProps = { params: Promise<{ enrollmentId: string }> };

/** Pay Later, restrict, revoke, restore, extend, or the overdue rule. Every change is logged. */
export async function POST(request: NextRequest, { params }: RouteProps) {
  const { enrollmentId } = await params;
  return handleManagementMutation(request, async ({ actor, body }) =>
    changeEnrollmentAccess(actor, requireId(enrollmentId, "enrollmentId"), parseAccessChange(body), { source: "MANUAL" })
  );
}
