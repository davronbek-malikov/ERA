import type { NextRequest } from "next/server";

import { handleManagementMutation } from "@/server/management/http";
import { createStudent, parseNewStudent } from "@/server/management/teaching";

/** Add a student account (and optionally enroll them). Needs the "create enrollments" permission. */
export async function POST(request: NextRequest) {
  return handleManagementMutation(request, async ({ actor, body }) => createStudent(actor, parseNewStudent(body), { source: "MANUAL" }), { status: 201 });
}
