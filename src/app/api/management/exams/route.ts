import type { NextRequest } from "next/server";

import { saveExam } from "@/server/management/exams";
import { handleManagementMutation } from "@/server/management/http";
import { parseExam } from "@/server/management/inputs";

/** Schedule an exam for a course in the actor's scope. */
export async function POST(request: NextRequest) {
  return handleManagementMutation(request, async ({ actor, body }) => saveExam(actor, parseExam(body), { source: "MANUAL" }), { status: 201 });
}
