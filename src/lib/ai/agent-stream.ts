import type { SourceView } from "@/components/assistant/source-list";

/*
 * Browser-side reader for ERA agent streams (Server-Sent Events from /api/era/chat and /api/ai/chat).
 * Shared by the Student Tutor and the Teacher/Admin assistants. Contains no secrets: the server decides the
 * provider, model, prompt and permissions.
 */

export type AgentStreamMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
  /** Knowledge Base sources of an assistant answer (Prompt 09). */
  sources?: SourceView[];
};

export type AgentStreamError =
  | { kind: "auth" }
  | { kind: "forbidden"; message: string }
  | { kind: "rate-limited"; retryAfterSeconds: number; message: string }
  | { kind: "limit-reached"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "interrupted"; message: string }
  | { kind: "cancelled" }
  | { kind: "offline" }
  | { kind: "error"; message: string };

export class AgentStreamFailure extends Error {
  constructor(public readonly detail: AgentStreamError) {
    super(detail.kind);
  }
}

export type AgentStreamHandlers = {
  onStart?: (info: { conversationId: string | null }) => void;
  onDelta?: (text: string) => void;
  /** The server discarded the partial answer (a fallback model took over); clear it. */
  onReset?: () => void;
};

export type AgentStreamResult = { conversationId: string | null; messages: AgentStreamMessage[] };

function errorFromPayload(status: number, payload: { code?: string; error?: string; message?: string } | null): AgentStreamError {
  const message = payload?.error ?? payload?.message ?? "Something went wrong. Please try again.";
  const code = payload?.code ?? "";
  if (status === 401) return { kind: "auth" };
  if (code === "ai-limit-reached") return { kind: "limit-reached", message };
  if (status === 429 || code === "rate-limited") {
    return { kind: "rate-limited", retryAfterSeconds: Number(/(\d+)\s*seconds?/.exec(message)?.[1] ?? 60), message };
  }
  if (status === 403 || status === 404) return { kind: "forbidden", message };
  if (code === "ai-cancelled") return { kind: "cancelled" };
  if (code === "ai-stream-interrupted") return { kind: "interrupted", message };
  if (status === 503 || code.startsWith("ai-provider") || code === "ai-not-configured") return { kind: "unavailable", message };
  return { kind: "error", message };
}

/** POSTs `body` and consumes the SSE stream until `done` or `error`. Rejects with AgentStreamFailure. */
export async function streamAgent(url: string, body: Record<string, unknown>, signal: AbortSignal, handlers: AgentStreamHandlers = {}) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ ...body, stream: true }),
      signal
    });
  } catch {
    throw new AgentStreamFailure(signal.aborted ? { kind: "cancelled" } : { kind: "offline" });
  }

  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/event-stream") || !response.body) {
    const payload = await response.json().catch(() => null);
    throw new AgentStreamFailure(errorFromPayload(response.status, payload));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        throw new AgentStreamFailure(signal.aborted ? { kind: "cancelled" } : { kind: "interrupted", message: "The connection was interrupted." });
      }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        let event: { type: string; [key: string]: unknown };
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }
        if (event.type === "start") handlers.onStart?.({ conversationId: (event.conversationId as string | null) ?? null });
        else if (event.type === "delta") handlers.onDelta?.(String(event.text ?? ""));
        else if (event.type === "reset") handlers.onReset?.();
        else if (event.type === "done") {
          return { conversationId: (event.conversationId as string | null) ?? null, messages: (event.messages as AgentStreamMessage[]) ?? [] };
        } else if (event.type === "error") {
          throw new AgentStreamFailure(errorFromPayload(200, { code: String(event.code ?? ""), error: String(event.message ?? "") }));
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  // The stream closed without a final event: the answer is incomplete and was not saved.
  throw new AgentStreamFailure(signal.aborted ? { kind: "cancelled" } : { kind: "interrupted", message: "The answer was interrupted and wasn't saved." });
}
