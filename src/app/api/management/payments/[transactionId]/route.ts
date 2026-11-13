import type { NextRequest } from "next/server";

import { requireId } from "@/lib/validation";
import { handleManagementMutation } from "@/server/management/http";
import { parsePaymentDecision } from "@/server/management/inputs";
import { decidePayment } from "@/server/management/payments";

type RouteProps = { params: Promise<{ transactionId: string }> };

/** approve | reject | reverse | correct. Transactions are never edited in place or deleted. */
export async function POST(request: NextRequest, { params }: RouteProps) {
  const { transactionId } = await params;
  return handleManagementMutation(request, async ({ actor, body }) =>
    decidePayment(actor, requireId(transactionId, "transactionId"), parsePaymentDecision(body), { source: "MANUAL" })
  );
}
