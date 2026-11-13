import type { NextRequest } from "next/server";

import { handleManagementMutation } from "@/server/management/http";
import { parseRecordPayment } from "@/server/management/inputs";
import { recordPayment } from "@/server/management/payments";
import { todayInPlatform } from "@/server/management/time";

/** Record a payment or refund. Always PENDING until an authorized user approves it. Idempotent by key. */
export async function POST(request: NextRequest) {
  return handleManagementMutation(
    request,
    async ({ actor, body }) => recordPayment(actor, parseRecordPayment(body, todayInPlatform()), { source: "MANUAL" }),
    { status: 201 }
  );
}
