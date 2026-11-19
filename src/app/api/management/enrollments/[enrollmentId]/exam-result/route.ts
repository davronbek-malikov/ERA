import type { NextRequest } from "next/server";

import { invalid, requireId } from "@/lib/validation";
import { EXAM_RESULTS, setExamResult, type ExamResult } from "@/server/management/exams";
import { handleManagementMutation } from "@/server/management/http";

type RouteProps = { params: Promise<{ enrollmentId: string }> };

/** { result: "PASSED" | "FAILED" | null } — the teacher's final exam result for this enrollment. */
export async function PUT(request: NextRequest, { params }: RouteProps) {
  const { enrollmentId } = await params;
  return handleManagementMutation(request, async ({ actor, body }) => {
    const result = body.result === null ? null : EXAM_RESULTS.find((value) => value === body.result);
    if (result === undefined) throw invalid("invalid-result", "result must be PASSED, FAILED or null.");
    return setExamResult(actor, requireId(enrollmentId, "enrollmentId"), result as ExamResult | null, { source: "MANUAL" });
  });
}
