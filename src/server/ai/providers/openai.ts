import { providerEnv } from "@/server/ai/config";
import { AiError } from "@/server/ai/errors";
import { mapHttpStatus, providerFetch, readLines } from "@/server/ai/providers/http-stream";
import type { AiProvider, ProviderEvent, ProviderMessage, ProviderRequest, ToolCall } from "@/server/ai/types";

/** Provider-neutral transcript → Chat Completions messages (tool results are role "tool" with tool_call_id). */
function toOpenAiMessages(messages: ProviderMessage[]) {
  return messages.flatMap((message): Array<Record<string, unknown>> => {
    if (message.role === "tool") {
      return message.results.map((result) => ({ role: "tool", tool_call_id: result.toolCallId, content: result.content }));
    }
    if (message.role === "assistant" && "toolCalls" in message) {
      return [
        {
          role: "assistant",
          content: message.content || null,
          tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.input) } }))
        }
      ];
    }
    return [{ role: message.role, content: message.content }];
  });
}

/*
 * OpenAI Chat Completions adapter (streaming SSE). Kept from the original provider layer; the key is read
 * from OPENAI_API_KEY (or the legacy ERA_API_KEY). OPENAI_BASE_URL allows compatible gateways and tests.
 */
/**
 * `flavor: "groq"` uses the same Chat Completions protocol against Groq (https://api.groq.com/openai/v1) with
 * GROQ_API_KEY (GROQ_BASE_URL overrides the address).
 */
export function createOpenAiProvider(model: string, flavor: "openai" | "groq" = "openai"): AiProvider {
  return {
    name: flavor,
    model,
    async *stream(request: ProviderRequest): AsyncGenerator<ProviderEvent> {
      const env = providerEnv();
      const apiKey = flavor === "groq" ? env.groqApiKey : env.openaiApiKey;
      const baseUrl = flavor === "groq" ? env.groqBaseUrl : env.openaiBaseUrl;
      if (!apiKey) throw new AiError("ai-not-configured", flavor === "groq" ? "GROQ_API_KEY is not set" : "OPENAI_API_KEY is not set");

      const response = await providerFetch(
        `${baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            stream: true,
            stream_options: { include_usage: true },
            max_completion_tokens: request.maxOutputTokens,
            messages: [{ role: "system", content: request.system }, ...toOpenAiMessages(request.messages)],
            ...(request.tools?.length
              ? { tools: request.tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })) }
              : {})
          }),
          signal: request.signal
        },
        flavor
      );
      if (!response.ok || !response.body) throw mapHttpStatus(response.status, flavor);

      let inputTokens: number | null = null;
      let outputTokens: number | null = null;
      let stopReason: string | null = null;
      let reportedModel = model;
      let finished = false;
      const partialCalls = new Map<number, { id: string; name: string; args: string }>();

      for await (const line of readLines(response.body, request.signal)) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          finished = true;
          break;
        }
        let chunk: {
          model?: string;
          choices?: Array<{
            delta?: { content?: string | null; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> };
            finish_reason?: string | null;
          }>;
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
        for (const delta of choice?.delta?.tool_calls ?? []) {
          const index = delta.index ?? 0;
          const entry = partialCalls.get(index) ?? { id: "", name: "", args: "" };
          if (delta.id) entry.id = delta.id;
          if (delta.function?.name) entry.name += delta.function.name;
          if (delta.function?.arguments) entry.args += delta.function.arguments;
          partialCalls.set(index, entry);
        }
        if (choice?.finish_reason) stopReason = choice.finish_reason;
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? null;
          outputTokens = chunk.usage.completion_tokens ?? null;
        }
      }

      // A stream that ends without [DONE] or a finish reason was cut off.
      if (!finished && !stopReason) throw new AiError("ai-stream-interrupted", "openai stream ended early");
      if (stopReason === "content_filter") throw new AiError("ai-refused", "openai content_filter");

      const toolCalls: ToolCall[] =
        stopReason === "tool_calls"
          ? [...partialCalls.values()].flatMap((call, index) => {
              if (!call.name) return [];
              let input: unknown = {};
              try {
                input = call.args ? JSON.parse(call.args) : {};
              } catch {
                input = {};
              }
              return [{ id: call.id || `call_${index + 1}`, name: call.name, input: input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {} }];
            })
          : [];

      yield {
        type: "done",
        model: reportedModel,
        stopReason: toolCalls.length ? "tool_use" : stopReason,
        ...(toolCalls.length ? { toolCalls } : {}),
        usage: {
          inputTokens,
          outputTokens,
          source: inputTokens !== null || outputTokens !== null ? "provider" : "unavailable"
        }
      };
    }
  };
}
