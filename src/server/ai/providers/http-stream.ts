import { AiError, isAbortError } from "@/server/ai/errors";

/** Yields complete lines from a streaming HTTP body (shared by the OpenAI SSE and Ollama NDJSON adapters). */
export async function* readLines(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal.aborted) throw new AiError("ai-cancelled");
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (signal.aborted || isAbortError(error)) throw new AiError("ai-cancelled");
        throw new AiError("ai-stream-interrupted", error instanceof Error ? error.message : "read failed");
      }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (line) yield line;
        newline = buffer.indexOf("\n");
      }
    }
    const rest = (buffer + decoder.decode()).trim();
    if (rest) yield rest;
  } finally {
    reader.releaseLock();
  }
}

/** fetch wrapper that converts network failures and aborts into AiErrors. */
export async function providerFetch(url: string, init: RequestInit & { signal: AbortSignal }, provider: string) {
  try {
    return await fetch(url, { ...init, cache: "no-store" });
  } catch (error) {
    if (init.signal.aborted || isAbortError(error)) throw new AiError("ai-cancelled");
    throw new AiError("ai-provider-unavailable", `${provider} connection error`);
  }
}

export function mapHttpStatus(status: number, provider: string): AiError {
  if (status === 401 || status === 403) return new AiError("ai-provider-auth", `${provider} ${status}`);
  if (status === 429 || status === 503 || status === 529) return new AiError("ai-provider-busy", `${provider} ${status}`);
  return new AiError("ai-provider-unavailable", `${provider} ${status}`);
}
