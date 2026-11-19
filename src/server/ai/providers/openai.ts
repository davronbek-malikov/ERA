import { providerEnv } from "@/server/ai/config";
import { AiError } from "@/server/ai/errors";
import { mapHttpStatus, providerFetch, readLines } from "@/server/ai/providers/http-stream";
import type { AiProvider, ProviderEvent, ProviderMessage, ProviderRequest, ToolCall } from "@/server/ai/types";

const GROQ_MAX_OUTPUT_TOKENS = 2048;
const RATE_LIMIT_RETRIES = 2;
const MAX_RATE_LIMIT_WAIT_MS = 20_000;

/** How long the provider asks us to wait (retry-after seconds, or Groq's x-ratelimit-reset-tokens like "7.66s"). */
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (header && /^\d+(\.\d+)?$/.test(header.trim())) return Math.ceil(Number(header) * 1000) + 250;
  const reset = response.headers.get("x-ratelimit-reset-tokens") ?? response.headers.get("x-ratelimit-reset-requests");
  const match = reset?.match(/^(?:(\d+)m)?(\d+(?:\.\d+)?)s$/);
  if (match) return Math.ceil(((Number(match[1] ?? 0) * 60) + Number(match[2])) * 1000) + 250;
  return null;
}

/** Operator log only: which limit was hit (per minute / per day), never keys or prompts. */
async function rateLimitDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? "";
    const limit = message.match(/on (tokens|requests) per (minute|day)[^:]*: Limit (\d+), Used (\d+), Requested (\d+)/i);
    if (limit) return `(${limit[1]} per ${limit[2]}: limit ${limit[3]}, used ${limit[4]}, requested ${limit[5]})`;
    return message ? `(${message.replace(/org_[A-Za-z0-9]+/g, "org").slice(0, 160)})` : "";
  } catch {
    return "";
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new AiError("ai-cancelled"));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new AiError("ai-cancelled"));
    }, { once: true });
  });
}

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

      const body = JSON.stringify({
        model,
        stream: true,
        stream_options: { include_usage: true },
        // Groq's free plan counts the requested answer size against a small per-minute token budget, so a
        // big reservation alone can trip its limit. A chat answer never needs more than this.
        max_completion_tokens: flavor === "groq" ? Math.min(request.maxOutputTokens, GROQ_MAX_OUTPUT_TOKENS) : request.maxOutputTokens,
        messages: [{ role: "system", content: request.system }, ...toOpenAiMessages(request.messages)],
        ...(request.tools?.length
          ? { tools: request.tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })) }
          : {})
      });
      const send = () =>
        providerFetch(
          `${baseUrl}/chat/completions`,
          { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body, signal: request.signal },
          flavor
        );

      // Rate limited (a tool step right after the first call often hits a per-minute limit): wait as long as the
      // provider asks, if that is short, and try again instead of failing the teacher's question.
      let response = await send();
      for (let attempt = 0; response.status === 429 && attempt < RATE_LIMIT_RETRIES; attempt += 1) {
        const wait = retryAfterMs(response);
        const detail = await rateLimitDetail(response);
        if (wait === null || wait > MAX_RATE_LIMIT_WAIT_MS) throw new AiError("ai-provider-busy", `${flavor} 429 ${detail}`.trim());
        await sleep(wait, request.signal);
        response = await send();
      }
      if (!response.ok || !response.body) {
        const error = mapHttpStatus(response.status, flavor);
        const detail = response.status === 429 || response.status === 413 || response.status === 400 ? await rateLimitDetail(response) : "";
        throw detail ? new AiError(error.code, `${error.logDetail} ${detail}`) : error;
      }

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
