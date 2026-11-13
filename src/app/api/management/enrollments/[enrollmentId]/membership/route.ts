import type { NextRequest } from "next/server";

import { invalid, requireId } from "@/lib/validation";
import { setCourseMembership } from "@/server/management/enrollments";
import { handleManagementMutation } from "@/server/management/http";

type RouteProps = { params: Promise<{ enrollmentId: string }> };

/** { action: "remove" | "restore", reason? } — remove a student from a course (access off, history kept) or bring them back. */
export async function POST(request: NextRequest, { params }: RouteProps) {
  const { enrollmentId } = await params;
  return handleManagementMutation(request, async ({ actor, body }) => {
    const action = body.action === "remove" || body.action === "restore" ? body.action : null;
    if (!action) throw invalid("invalid-action", "action must be remove or restore.");
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : null;
    return setCourseMembership(actor, requireId(enrollmentId, "enrollmentId"), action, reason, { source: "MANUAL" });
  });
}
