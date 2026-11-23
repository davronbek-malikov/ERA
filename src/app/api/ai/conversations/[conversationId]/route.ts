import { NextRequest } from "next/server";

import { createApiSuccessResponse } from "@/lib/app-errors";
import { isValidId } from "@/lib/validation";
import { parseWorkspaceAgent, requireWorkspaceAgentUser } from "@/server/ai/access";
import { getConversationMessages } from "@/server/ai/conversations";
import { AGENT_ENUM } from "@/server/ai/types";
import { authErrors, toApiErrorResponse } from "@/server/authz";

type RouteProps = { params: Promise<{ conversationId: string }> };

/** Messages of one conversation the signed-in user owns. Anyone else's conversation is "not found". */
export async function GET(request: NextRequest, { params }: RouteProps) {
  try {
    const agent = parseWorkspaceAgent(request.nextUrl.searchParams.get("agent"));
    const { user } = await requireWorkspaceAgentUser(agent);
    const { conversationId } = await params;
    if (!isValidId(conversationId)) throw authErrors.notFound("Conversation not found.");

    const { conversation, messages } = await getConversationMessages(user.id, conversationId, AGENT_ENUM[agent]);
    return createApiSuccessResponse({
      conversation: { id: conversation.id, title: conversation.title, courseId: conversation.courseId },
      messages
    });
  } catch (error) {
    return toApiErrorResponse(error, {
      code: "conversation-unavailable",
      message: "This conversation is temporarily unavailable.",
      log: "ai-conversation"
    });
  }
}
