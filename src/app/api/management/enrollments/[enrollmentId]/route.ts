import type { NextRequest } from "next/server";

import { requireId } from "@/lib/validation";
import { updateEnrollment } from "@/server/management/enrollments";
import { handleManagementMutation } from "@/server/management/http";
import { parseUpdateEnrollment } from "@/server/management/inputs";

type RouteProps = { params: Promise<{ enrollmentId: string }> };

/** Change dates, due date, price, status, teacher or the internal note of an enrollment. */
export async function PATCH(request: NextRequest, { params }: RouteProps) {
  const { enrollmentId } = await params;
  return handleManagementMutation(request, async ({ actor, body }) =>
    updateEnrollment(actor, requireId(enrollmentId, "enrollmentId"), parseUpdateEnrollment(body), { source: "MANUAL" })
  );
}
