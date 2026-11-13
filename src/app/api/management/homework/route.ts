import type { NextRequest } from "next/server";

import { handleManagementMutation } from "@/server/management/http";
import { parseHomeworkReview, reviewHomework } from "@/server/management/teaching";

/** Record the check of one student's homework for one lesson (status, GitHub link, note). */
export async function PUT(request: NextRequest) {
  return handleManagementMutation(request, async ({ actor, body }) => reviewHomework(actor, parseHomeworkReview(body), { source: "MANUAL" }));
}
