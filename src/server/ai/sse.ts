import type { EngineEvent } from "@/server/ai/types";

/*
 * Server-Sent Events transport for agent streams (docs/ERA_AI_ARCHITECTURE.md §7).
 * Each engine event becomes `event: <type>\ndata: <json>\n\n`. When the browser disconnects or the user presses
 * Stop, the request signal / stream cancel aborts the provider call; the engine then records a CANCELLED usage
 * event and saves nothing.
 */
export function sseResponse(run: (signal: AbortSignal) => AsyncGenerator<EngineEvent>, requestSignal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (requestSignal.aborted) abort();
  else requestSignal.addEventListener("abort", abort, { once: true });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      const write = (event: EngineEvent) => {
        try {
          streamController.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
        } catch {
          // The client went away; the abort below stops the provider.
          abort();
        }
      };
      try {
        for await (const event of run(controller.signal)) write(event);
      } finally {
        requestSignal.removeEventListener("abort", abort);
        try {
          streamController.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      abort();
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}

export function wantsEventStream(request: Request, body: Record<string, unknown>) {
  return body.stream === true || (request.headers.get("accept") ?? "").includes("text/event-stream");
}
