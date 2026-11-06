import { providerEnv } from "@/server/ai/config";
import { AiError } from "@/server/ai/errors";
import { mapHttpStatus, providerFetch, readLines } from "@/server/ai/providers/http-stream";
import type { AiProvider, ProviderEvent, ProviderRequest } from "@/server/ai/types";

/*
 * OpenAI Chat Completions adapter (streaming SSE). Kept from the original provider layer; the key is read
 * from OPENAI_API_KEY (or the legacy ERA_API_KEY). OPENAI_BASE_URL allows compatible gateways and tests.
 */
export function createOpenAiProvider(model: string): AiProvider {
  return {
    name: "openai",
    model,
    async *stream(request: ProviderRequest): AsyncGenerator<ProviderEvent> {
      const { openaiApiKey, openaiBaseUrl } = providerEnv();
      if (!openaiApiKey) throw new AiError("ai-not-configured", "OPENAI_API_KEY is not set");

      const response = await providerFetch(
        `${openaiBaseUrl}/chat/completions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiApiKey}` },
          body: JSON.stringify({
            model,
            stream: true,
            stream_options: { include_usage: true },
            max_completion_tokens: request.maxOutputTokens,
            messages: [{ role: "system", content: request.system }, ...request.messages]
          }),
          signal: request.signal
        },
        "openai"
      );
      if (!response.ok || !response.body) throw mapHttpStatus(response.status, "openai");

      let inputTokens: number | null = null;
      let outputTokens: number | null = null;
      let stopReason: string | null = null;
      let reportedModel = model;
      let finished = false;

      for await (const line of readLines(response.body, request.signal)) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          finished = true;
          break;
        }
        let chunk: {
          model?: string;
          choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
        };
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        if (chunk.model) reportedModel = chunk.model;
        const choice = chunk.choices?.[0];
        if (choice?.delta?.content) yield { type: "text", text: choice.delta.content };
        if (choice?.finish_reason) stopReason = choice.finish_reason;
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? null;
          outputTokens = chunk.usage.completion_tokens ?? null;
        }
      }

      // A stream that ends without [DONE] or a finish reason was cut off.
      if (!finished && !stopReason) throw new AiError("ai-stream-interrupted", "openai stream ended early");
      if (stopReason === "content_filter") throw new AiError("ai-refused", "openai content_filter");

      yield {
        type: "done",
        model: reportedModel,
        stopReason,
        usage: {
          inputTokens,
          outputTokens,
          source: inputTokens !== null || outputTokens !== null ? "provider" : "unavailable"
        }
      };
    }
  };
}
