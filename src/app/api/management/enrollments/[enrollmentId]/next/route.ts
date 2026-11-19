import type { NextRequest } from "next/server";

import { invalid, requireId } from "@/lib/validation";
import { moveToNextCourse } from "@/server/management/enrollments";
import { handleManagementMutation } from "@/server/management/http";
import { parseCreateEnrollment } from "@/server/management/inputs";
import { todayInPlatform } from "@/server/management/time";

type RouteProps = { params: Promise<{ enrollmentId: string }> };

/**
 * Move the student to the next course (month): { courseId, startDate, endDate?, priceAmount?, paymentArrangement?,
 * paymentDueDate?, examResult?: "PASSED" | "FAILED" | null (result of the course being finished) }.
 */
export async function POST(request: NextRequest, { params }: RouteProps) {
  const { enrollmentId } = await params;
  return handleManagementMutation(
    request,
    async ({ actor, body }) => {
      const examResult = body.examResult === undefined ? undefined : body.examResult === null || body.examResult === "" ? null : body.examResult === "PASSED" || body.examResult === "FAILED" ? body.examResult : "bad";
      if (examResult === "bad") throw invalid("invalid-result", "examResult must be PASSED, FAILED or empty.");
      const today = todayInPlatform();
      return moveToNextCourse(
        actor,
        requireId(enrollmentId, "enrollmentId"),
        (current) =>
          parseCreateEnrollment(
            {
              ...body,
              studentId: current.userId,
              currency: current.currency,
              paymentArrangement: body.paymentArrangement ?? current.paymentArrangement ?? "PAY_IN_FULL",
              priceAmount: body.priceAmount === undefined ? current.priceAmount : body.priceAmount,
              grantAccess: true
            },
            today
          ),
        examResult as "PASSED" | "FAILED" | null | undefined,
        { source: "MANUAL" }
      );
    },
    { status: 201 }
  );
}
