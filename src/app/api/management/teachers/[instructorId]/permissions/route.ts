import type { NextRequest } from "next/server";

import { invalid, requireId } from "@/lib/validation";
import { handleManagementMutation } from "@/server/management/http";
import { setTeacherPermissions } from "@/server/management/teacher-permissions";

type RouteProps = { params: Promise<{ instructorId: string }> };

const KEYS = ["viewPayments", "recordPayments", "approvePayments", "manageEnrollments", "manageAccess"] as const;

/** Administrators only: what one teacher may do in Student Management. */
export async function PUT(request: NextRequest, { params }: RouteProps) {
  const { instructorId } = await params;
  return handleManagementMutation(request, async ({ actor, body }) => {
    const permissions = Object.fromEntries(
      KEYS.map((key) => {
        if (typeof body[key] !== "boolean") throw invalid(`invalid-${key}`, `${key} must be true or false.`);
        return [key, body[key]];
      })
    ) as Record<(typeof KEYS)[number], boolean>;
    return { permissions: await setTeacherPermissions(actor, requireId(instructorId, "instructorId"), permissions) };
  });
}
