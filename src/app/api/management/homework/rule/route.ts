import type { NextRequest } from "next/server";

import { handleManagementMutation } from "@/server/management/http";
import { parseHomeworkRule, updateHomeworkRule } from "@/server/management/teaching";

/** { enabled, perWeek } — the signed-in teacher's weekly homework rule for their own students. */
export async function PUT(request: NextRequest) {
  return handleManagementMutation(request, async ({ actor, body }) => updateHomeworkRule(actor, parseHomeworkRule(body), { source: "MANUAL" }));
}
