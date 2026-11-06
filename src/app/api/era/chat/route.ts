import { NextRequest } from "next/server";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { formatClock } from "@/lib/format";
import { getLocale } from "@/lib/i18n-server";
import { optionalId, optionalInteger, readJsonObject, requireId, requireString } from "@/lib/validation";
import { aiLimits } from "@/server/ai/config";
import { buildLessonContext } from "@/server/ai/context";
import { buildKnowledgeContext } from "@/server/ai/knowledge";
import { composeSelectionMessage, parseSelection, resolveSelectionSource, storedSelectionMessage } from "@/server/ai/contextual";
import { getLessonHistoryForModel } from "@/server/ai/conversations";
import { collectAgentRun, prepareAgentRun, runAgent } from "@/server/ai/engine";
import { sseResponse, wantsEventStream } from "@/server/ai/sse";
import { assertSameOrigin, requireLessonAccess, requireStudentUser, toApiErrorResponse } from "@/server/authz";

const MAX_QUESTION_LENGTH = 3000;
const MAX_VIDEO_SECONDS = 24 * 60 * 60;

/**
 * ERA Tutor (Student Agent). Only enrolled students, only for lessons of a course they are enrolled in.
 * The user, course and conversation are derived on the server; the browser sends a lesson id and either a
 * question or an Ask ERA AI `selection` (docs/ERA_CONTEXTUAL_AI.md), plus an optional video position.
 * Runs on the shared AI Agent Engine.
 *
 * Response: JSON `{ ok, answer, messages }` (unchanged contract), or Server-Sent Events when the request has
 * `"stream": true` or `Accept: text/event-stream`.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const currentUser = await requireStudentUser();
    const body = await readJsonObject(request, 24 * 1024);

    const lessonId = requireId(body.lessonId, "lessonId");
    const courseId = optionalId(body.courseId, "courseId");
    const locale = await getLocale();

    // Ask ERA AI: a highlighted passage instead of a typed question. Its source is authorized independently.
    const selection = body.selection !== undefined ? parseSelection(body.selection, "student") : null;
    const source = selection ? await resolveSelectionSource(currentUser, "student", selection) : null;
    if (source && source.lessonId !== lessonId) {
      // The selection must come from the lesson whose tutor thread it joins.
      return createApiErrorResponse(404, "not-found", "Lesson not found.");
    }

    const question = selection ? null : requireString(body.question, "question", { max: MAX_QUESTION_LENGTH });
    const timestampSeconds = optionalInteger(body.timestampSeconds, "timestampSeconds", { min: 0, max: MAX_VIDEO_SECONDS });

    const access = await requireLessonAccess(currentUser, lessonId, { courseId, studentsOnly: true });
    const lessonContext = await buildLessonContext(access.lesson.id);
    if (!lessonContext) {
      return createApiErrorResponse(404, "not-found", "Lesson not found.");
    }

    // The timestamp is a separate, validated field; the note is composed here, not by the browser.
    const momentNote = timestampSeconds === undefined ? "" : ["", "", `(Asked at ${formatClock(timestampSeconds)} in the lesson video.)`].join("\n");
    const modelMessage = selection ? composeSelectionMessage(selection, locale === "uz" ? "uz" : "en") + momentNote : `${question}${momentNote}`;
    const storedQuestion = selection ? storedSelectionMessage(selection) + momentNote : modelMessage;

    const prepared = await prepareAgentRun({
      user: { id: currentUser.id, role: currentUser.role, name: currentUser.name },
      agent: "student",
      message: modelMessage,
      storedMessage: storedQuestion,
      contextBlocks: [...lessonContext.blocks, ...(source?.blocks ?? [])],
      history: await getLessonHistoryForModel(currentUser.id, access.lesson.id, aiLimits.maxHistoryMessages()),
      thread: { kind: "lesson", courseId: access.course.id, lessonId: access.lesson.id },
      locale
    });

    // Knowledge Base (Prompt 09): authorized passages for this course and lesson. Runs after the usage limits.
    const knowledge = await buildKnowledgeContext(
      currentUser,
      selection ? [selection.question, selection.selectedText].filter(Boolean).join("\n") : (question ?? ""),
      { agent: "student", courseId: access.course.id, lessonId: access.lesson.id }
    );
    prepared.context.contextBlocks.push(...knowledge.blocks);
    prepared.context.sources = knowledge.sources;

    if (wantsEventStream(request, body)) {
      return sseResponse((signal) => runAgent(prepared, signal), request.signal);
    }

    const result = await collectAgentRun(prepared, request.signal);
    if (!result.ok) {
      const status = result.code === "ai-refused" ? 422 : result.code === "ai-cancelled" ? 499 : 503;
      return createApiErrorResponse(status, result.code, result.message, { retryable: result.retryable });
    }
    return createApiSuccessResponse({
      answer: result.messages.find((message) => message.role === "ASSISTANT")?.content ?? "",
      messages: result.messages
    });
  } catch (error) {
    return toApiErrorResponse(error, {
      code: "era-unavailable",
      message: "ERA is temporarily unavailable. Please try again in a moment.",
      log: "era-chat"
    });
  }
}
