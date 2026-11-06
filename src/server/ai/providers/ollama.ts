import { providerEnv } from "@/server/ai/config";
import { AiError } from "@/server/ai/errors";
import { mapHttpStatus, providerFetch, readLines } from "@/server/ai/providers/http-stream";
import type { AiProvider, ProviderEvent, ProviderRequest } from "@/server/ai/types";

/** Ollama adapter for local development (streaming NDJSON from /api/chat). No key; no cost. */
export function createOllamaProvider(model: string): AiProvider {
  return {
    name: "ollama",
    model,
    async *stream(request: ProviderRequest): AsyncGenerator<ProviderEvent> {
      const { ollamaBaseUrl } = providerEnv();
      const response = await providerFetch(
        `${ollamaBaseUrl}/api/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            stream: true,
            options: { temperature: 0.3, num_predict: request.maxOutputTokens },
            messages: [{ role: "system", content: request.system }, ...request.messages]
          }),
          signal: request.signal
        },
        "ollama"
      );
      if (!response.ok || !response.body) throw mapHttpStatus(response.status, "ollama");

      for await (const line of readLines(response.body, request.signal)) {
        let chunk: {
          message?: { content?: string };
          done?: boolean;
          done_reason?: string;
          prompt_eval_count?: number;
          eval_count?: number;
          error?: string;
        };
        try {
          chunk = JSON.parse(line);
        } catch {
          continue;
        }
        if (chunk.error) throw new AiError("ai-provider-unavailable", "ollama reported an error");
        if (chunk.message?.content) yield { type: "text", text: chunk.message.content };
        if (chunk.done) {
          const reported = chunk.prompt_eval_count !== undefined || chunk.eval_count !== undefined;
          yield {
            type: "done",
            model,
            stopReason: chunk.done_reason ?? "stop",
            usage: {
              inputTokens: chunk.prompt_eval_count ?? null,
              outputTokens: chunk.eval_count ?? null,
              source: reported ? "provider" : "unavailable"
            }
          };
          return;
        }
      }
      // The body ended without a `done` chunk: the stream was cut off.
      throw new AiError("ai-stream-interrupted", "ollama stream ended early");
    }
  };
}
