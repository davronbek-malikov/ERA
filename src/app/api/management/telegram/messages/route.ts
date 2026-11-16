import type { NextRequest } from "next/server";

import { handleManagementMutation } from "@/server/management/http";
import { createMessage, parseMessageInput } from "@/server/telegram/messages";

/**
 * { text, audience: ALL|BEHIND|SELECTED, studentIds?, when: NOW|ONCE|WEEKLY, date?, time?, weekday? }
 * A Telegram message from the signed-in teacher to their own students: sent now, or scheduled.
 */
export async function POST(request: NextRequest) {
  return handleManagementMutation(request, async ({ actor, body }) => createMessage(actor, parseMessageInput(body)), { status: 201 });
}
