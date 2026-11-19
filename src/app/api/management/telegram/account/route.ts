import type { NextRequest } from "next/server";

import { invalid } from "@/lib/validation";
import { handleManagementMutation } from "@/server/management/http";
import { disconnectAccount, startAccountLogin, submitAccountCode, submitAccountPassword } from "@/server/telegram/account";

export const maxDuration = 60;

/**
 * Connect the signed-in teacher's own Telegram account, step by step:
 *   { step: "phone", phone } → { step: "code", code } → (two-step verification) { step: "password", password }
 */
export async function POST(request: NextRequest) {
  return handleManagementMutation(request, async ({ actor, body }) => {
    if (body.step === "phone") return startAccountLogin(actor, body.phone);
    if (body.step === "code") return submitAccountCode(actor, body.code);
    if (body.step === "password") return submitAccountPassword(actor, body.password);
    throw invalid("invalid-step", "step must be phone, code or password.");
  });
}

/** Disconnect: ERA logs out of the teacher's Telegram and forgets the session. */
export async function DELETE(request: NextRequest) {
  return handleManagementMutation(request, async ({ actor }) => disconnectAccount(actor), { bodyless: true });
}
