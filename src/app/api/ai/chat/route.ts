import { NextRequest } from "next/server";

import { getLocale } from "@/lib/i18n-server";
import { optionalId, readJsonObject, requireString } from "@/lib/validation";
import { parseWorkspaceAgent, requireOwnCourseForTeacherAgent, requireWorkspaceAgentUser } from "@/server/ai/access";
import { aiLimits } from "@/server/ai/config";
import { buildAdminPlatformContext, buildTeacherCourseContext } from "@/server/ai/context";
import { composeSelectionMessage, parseSelection, resolveSelectionSource, storedSelectionMessage } from "@/server/ai/contextual";
import { getConversationHistoryForModel, requireOwnedConversation } from "@/server/ai/conversations";
import { buildKnowledgeContext } from "@/server/ai/knowledge";
import { prepareAgentRun, runAgent } from "@/server/ai/engine";
import { sseResponse } from "@/server/ai/sse";
import { AGENT_ENUM } from "@/server/ai/types";
import { assertSameOrigin, toApiErrorResponse } from "@/server/authz";

const MAX_MESSAGE_LENGTH = 8000;

/**
 * Teacher Assistant and Admin Platform Assistant (one secure endpoint, shared engine). Always streams SSE.
 * Body: { agent: "teacher" | "admin", message | selection, conversationId?, courseId? (teacher only) }.
 * `selection` is an Ask ERA AI request (docs/ERA_CONTEXTUAL_AI.md); its source is authorized here.
 * The role, user, ownership and course scope are decided on the server; extra fields are ignored.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request, 48 * 1024);
    const agent = parseWorkspaceAgent(body.agent);
    const { user, instructorId } = await requireWorkspaceAgentUser(agent);
    const locale = await getLocale();

    const selection = body.selection !== undefined ? parseSelection(body.selection, agent) : null;
    const source = selection ? await resolveSelectionSource(user, agent, selection, instructorId ? { instructorId } : undefined) : null;

    const message = selection
      ? composeSelectionMessage(selection, locale === "uz" ? "uz" : "en")
      : requireString(body.message, "message", { max: MAX_MESSAGE_LENGTH });
    const storedMessage = selection ? storedSelectionMessage(selection) : undefined;
    const conversationId = optionalId(body.conversationId, "conversationId");
    const requestedCourseId = agent === "teacher" ? (source?.courseId ?? optionalId(body.courseId, "courseId")) : undefined;

    const conversation = conversationId ? await requireOwnedConversation(user.id, conversationId, AGENT_ENUM[agent]) : null;

    // Teacher: the course comes from the selection, the request or the conversation, re-checked every time.
    const courseId = requestedCourseId ?? conversation?.courseId ?? null;
    if (agent === "teacher" && courseId) await requireOwnCourseForTeacherAgent(instructorId!, courseId);

    // Base context per agent; a selection's own source context is added on top (without duplicates).
    const baseBlocks =
      agent === "admin"
        ? selection?.sourceType === "report"
          ? []
          : await buildAdminPlatformContext()
        : courseId && selection?.sourceType !== "course"
          ? await buildTeacherCourseContext(courseId)
          : [];

    const prepared = await prepareAgentRun({
      user: { id: user.id, role: user.role, name: user.name },
      agent,
      message,
      storedMessage,
      contextBlocks: [...baseBlocks, ...(source?.blocks ?? [])],
      history: conversation ? await getConversationHistoryForModel(user.id, conversation.id, AGENT_ENUM[agent], aiLimits.maxHistoryMessages()) : [],
      thread: {
        kind: "conversation",
        conversationId: conversation?.id ?? null,
        courseId: agent === "teacher" ? courseId : null,
        title: (storedMessage ?? message).replace(/\s+/g, " ")
      },
      locale
    });

    // Knowledge Base (Prompt 09): authorized passages (teacher: own courses/private/platform; admin: platform and
    // courses). A selected course narrows the search. Runs after the usage limits.
    const knowledge = await buildKnowledgeContext(
      user,
      selection ? [selection.question, selection.selectedText].filter(Boolean).join("\n") : message,
      { agent, courseId: agent === "teacher" ? courseId : null }
    );
    prepared.context.contextBlocks.push(...knowledge.blocks);
    prepared.context.sources = knowledge.sources;

    return sseResponse((signal) => runAgent(prepared, signal), request.signal);
  } catch (error) {
    return toApiErrorResponse(error, {
      code: "assistant-unavailable",
      message: "The assistant is temporarily unavailable. Please try again in a moment.",
      log: "ai-chat"
    });
  }
}
