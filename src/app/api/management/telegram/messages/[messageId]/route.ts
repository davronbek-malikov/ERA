import type { NextRequest } from "next/server";

import { invalid } from "@/lib/validation";
import { handleManagementMutation } from "@/server/management/http";
import { deleteMessage, setMessageActive } from "@/server/telegram/messages";

type RouteProps = { params: Promise<{ messageId: string }> };

/** { active: boolean } — pause or resume one of the teacher's scheduled messages. */
export async function PATCH(request: NextRequest, { params }: RouteProps) {
  const { messageId } = await params;
  return handleManagementMutation(request, async ({ actor, body }) => {
    if (typeof body.active !== "boolean") throw invalid("invalid-active", "active must be true or false.");
    return setMessageActive(actor, messageId, body.active);
  });
}

/** Delete one of the teacher's scheduled messages (and its delivery history). */
export async function DELETE(request: NextRequest, { params }: RouteProps) {
  const { messageId } = await params;
  return handleManagementMutation(request, async ({ actor }) => deleteMessage(actor, messageId), { bodyless: true });
}
