import type { NextRequest } from "next/server";

import { handleManagementMutation } from "@/server/management/http";
import { sendRemindersNow } from "@/server/management/reminders";

/** "Send now": Telegram reminder to the teacher's own students who are behind (never twice for the same week). */
export async function POST(request: NextRequest) {
  return handleManagementMutation(request, async ({ actor }) => ({ summary: await sendRemindersNow(actor) }));
}
