import type { NextRequest } from "next/server";

import { createEnrollment } from "@/server/management/enrollments";
import { handleManagementMutation } from "@/server/management/http";
import { parseCreateEnrollment } from "@/server/management/inputs";
import { todayInPlatform } from "@/server/management/time";

/** Create an enrollment (with an optional initial payment, recorded as PENDING). */
export async function POST(request: NextRequest) {
  return handleManagementMutation(
    request,
    async ({ actor, body }) => {
      const input = parseCreateEnrollment(body, todayInPlatform());
      return createEnrollment(actor, input, { source: "MANUAL" });
    },
    { status: 201 }
  );
}
