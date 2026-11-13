import { NextRequest } from "next/server";

import { createApiSuccessResponse } from "@/lib/app-errors";
import { parseWorkspaceAgent, requireWorkspaceAgentUser } from "@/server/ai/access";
import { listConversations } from "@/server/ai/conversations";
import { AGENT_ENUM } from "@/server/ai/types";
import { toApiErrorResponse } from "@/server/authz";

/** The signed-in user's own Teacher/Admin assistant conversations (`?agent=teacher|admin`). */
export async function GET(request: NextRequest) {
  try {
    const agent = parseWorkspaceAgent(request.nextUrl.searchParams.get("agent"));
    const { user } = await requireWorkspaceAgentUser(agent);
    return createApiSuccessResponse({ conversations: await listConversations(user.id, AGENT_ENUM[agent]) });
  } catch (error) {
    return toApiErrorResponse(error, {
      code: "conversations-unavailable",
      message: "Conversations are temporarily unavailable.",
      log: "ai-conversations"
    });
  }
}
