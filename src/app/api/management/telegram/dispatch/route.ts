import type { NextRequest } from "next/server";

import { handleManagementMutation } from "@/server/management/http";
import { dispatchForTeacher } from "@/server/telegram/messages";

export const maxDuration = 60;

/** Backup timer from the open Messages page: sends the signed-in teacher's own due messages. */
export async function POST(request: NextRequest) {
  return handleManagementMutation(request, async ({ actor }) => dispatchForTeacher(actor));
}
