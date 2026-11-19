import type { NextRequest } from "next/server";

import { requireId } from "@/lib/validation";
import { deleteExam, saveExam } from "@/server/management/exams";
import { handleManagementMutation } from "@/server/management/http";
import { parseExam } from "@/server/management/inputs";

type RouteProps = { params: Promise<{ examId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteProps) {
  const { examId } = await params;
  return handleManagementMutation(request, async ({ actor, body }) =>
    saveExam(actor, parseExam(body), { source: "MANUAL", examId: requireId(examId, "examId") })
  );
}

export async function DELETE(request: NextRequest, { params }: RouteProps) {
  const { examId } = await params;
  return handleManagementMutation(request, async ({ actor }) => deleteExam(actor, requireId(examId, "examId"), { source: "MANUAL" }), { bodyless: true });
}
