import type { NextRequest } from "next/server";

import { handleManagementMutation } from "@/server/management/http";
import { retryUnreached } from "@/server/telegram/messages";

export const maxDuration = 60;

type RouteProps = { params: Promise<{ messageId: string }> };

/** Send one of the teacher's messages again to the students it didn't reach (with their current contacts). */
export async function POST(request: NextRequest, { params }: RouteProps) {
  const { messageId } = await params;
  return handleManagementMutation(request, async ({ actor }) => retryUnreached(actor, messageId));
}
