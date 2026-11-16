import type { NextRequest } from "next/server";

import { handleManagementMutation } from "@/server/management/http";
import { parseReminderSettings, updateReminderSettings } from "@/server/management/reminders";

/** { enabled, text } — the signed-in teacher's automatic Saturday Telegram reminder. */
export async function PUT(request: NextRequest) {
  return handleManagementMutation(request, async ({ actor, body }) => updateReminderSettings(actor, parseReminderSettings(body), { source: "MANUAL" }));
}
