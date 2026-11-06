/*
 * ERA Tutor client: the single integration point between the classroom UI and the tutor backend.
 *
 * It calls /api/era/chat (streamed through the shared ERA AI Agent Engine, Prompt 08) and /api/era/history.
 * Answers come from the current lesson's notes; the retrieval backend (transcript segments, materials,
 * course knowledge) will plug in behind these same functions without changing the UI.
 */

import { streamAgent, type AgentStreamHandlers } from "@/lib/ai/agent-stream";
import type { AskEraSelectionPayload } from "@/lib/ai/ask-era";
import type { SourceView } from "@/components/assistant/source-list";

/**
 * The context a lesson-first tutor needs (docs/ERA_INFORMATION_ARCHITECTURE.md §10.2).
 * Only `lessonId` and the student-chosen extras travel from the browser. The server derives the
 * student and organization from the session, and retrieves transcript segments and materials
 * itself, so the whole course or transcript is never sent with a question.
 */
export type TutorServerContext = {
  studentId: string; // from the session, never from the client
  organizationId: string | null; // from the session (organizations aren't modelled yet)
  courseId: string;
  lessonId: string;
  videoId: string | null;
  timestampSeconds: number | null;
  transcriptSegments: Array<{ startSeconds: number; endSeconds: number; text: string }>;
  materials: Array<{ title: string; excerpt: string }>;
};

/** What the browser sends. */
export type TutorRequest = {
  lessonId: string;
  question: string;
  /** Ask ERA AI: a highlighted passage (the question is then only the display text). */
  selection?: AskEraSelectionPayload;
  /** Present only when the student attached "this moment" to the question. */
  timestampSeconds?: number;
};

export type TutorSourceKind = "lesson" | "course" | "general";

export type TutorMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
  /** Knowledge Base passages the answer was grounded in (Prompt 09). */
  sources?: SourceView[];
};

export type TutorError =
  | { kind: "auth" }
  | { kind: "rate-limited"; retryAfterSeconds: number }
  | { kind: "unavailable"; message: string }
  | { kind: "offline" }
  | { kind: "error"; message: string };

export class TutorRequestError extends Error {
  constructor(public readonly detail: TutorError) {
    super(detail.kind);
  }
}

export { formatClock } from "@/lib/format";

async function parse(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | ({ ok?: boolean; error?: string; code?: string } & Record<string, unknown>)
    | null;

  if (response.ok && payload && payload.ok !== false) {
    return payload;
  }

  const message = payload?.error ?? "ERA couldn't answer that.";
  if (response.status === 401) throw new TutorRequestError({ kind: "auth" });
  if (response.status === 429) {
    const seconds = Number(/(\d+)\s*seconds?/.exec(message)?.[1] ?? 60);
    throw new TutorRequestError({ kind: "rate-limited", retryAfterSeconds: seconds });
  }
  if (response.status === 503) throw new TutorRequestError({ kind: "unavailable", message });
  throw new TutorRequestError({ kind: "error", message });
}

async function request(input: string, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch {
    throw new TutorRequestError({ kind: "offline" });
  }
}

export async function askTutor(tutorRequest: TutorRequest): Promise<TutorMessage[]> {
  const response = await request("/api/era/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // The moment travels as a validated field; the server composes the note stored with the question.
    body: JSON.stringify({
      lessonId: tutorRequest.lessonId,
      ...(tutorRequest.selection ? { selection: tutorRequest.selection } : { question: tutorRequest.question }),
      ...(tutorRequest.timestampSeconds === undefined ? {} : { timestampSeconds: Math.max(0, Math.floor(tutorRequest.timestampSeconds)) })
    })
  });
  const payload = await parse(response);
  return (payload.messages as TutorMessage[] | undefined) ?? [];
}

export async function loadTutorHistory(lessonId: string): Promise<TutorMessage[]> {
  const response = await request(`/api/era/history?lesson_id=${encodeURIComponent(lessonId)}`, { cache: "no-store" });
  const payload = await parse(response);
  return (payload.messages as TutorMessage[] | undefined) ?? [];
}

/**
 * Streams an answer. Text arrives through `handlers.onDelta`; resolves with the saved question and answer.
 * Rejects with AgentStreamFailure (cancelled, interrupted, rate-limited, limit-reached, ...). A failed or
 * stopped answer is never saved on the server.
 */
export async function streamTutor(tutorRequest: TutorRequest, signal: AbortSignal, handlers: AgentStreamHandlers) {
  const result = await streamAgent(
    "/api/era/chat",
    {
      lessonId: tutorRequest.lessonId,
      question: tutorRequest.question,
      ...(tutorRequest.timestampSeconds === undefined ? {} : { timestampSeconds: Math.max(0, Math.floor(tutorRequest.timestampSeconds)) })
    },
    signal,
    handlers
  );
  return result.messages as TutorMessage[];
}
