import type { NextRequest } from "next/server";

import { addStudentNote } from "@/server/management/exams";
import { handleManagementMutation } from "@/server/management/http";
import { parseNote } from "@/server/management/inputs";

/** Internal note about a student. Never shown to students. */
export async function POST(request: NextRequest) {
  return handleManagementMutation(request, async ({ actor, body }) => ({ note: await addStudentNote(actor, parseNote(body), { source: "MANUAL" }) }), {
    status: 201
  });
}
