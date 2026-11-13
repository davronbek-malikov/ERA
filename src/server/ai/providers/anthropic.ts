import Anthropic from "@anthropic-ai/sdk";

import { anthropicOptions } from "@/server/ai/config";
import { AiError } from "@/server/ai/errors";
import type { AiProvider, ProviderEvent, ProviderMessage, ProviderRequest, ToolCall } from "@/server/ai/types";

/*
 * Anthropic Claude adapter (official SDK). Credentials are resolved by the SDK from the server environment
 * (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or an `ant auth login` profile); ANTHROPIC_BASE_URL is honoured,
 * which the test suite uses to point at a local fake.
 *
 * - Thinking: not set, so current Claude models use their default (adaptive on Claude Opus 5.5).
 * - Effort: `ERA_AI_EFFORT` (default "medium", Claude Opus 5.5's own default made explicit).
 * - Refusals: server-side fallback (`fallbacks: "default"`) is on by default, so a request a safety classifier
 *   declines is retried on a fallback model inside the same call. A refusal of the whole chain becomes
 *   `ai-refused` and nothing is saved. Disable with ERA_AI_ANTHROPIC_FALLBACKS=off.
 */

// One client per credential/base-URL pair, so a rotated key takes effect without a restart.
const clients = new Map<string, Anthropic>();

function getClient() {
  const cacheKey = `${process.env.ANTHROPIC_API_KEY ?? ""}|${process.env.ANTHROPIC_AUTH_TOKEN ?? ""}|${process.env.ANTHROPIC_BASE_URL ?? ""}`;
  let client = clients.get(cacheKey);
  if (!client) {
    try {
      client = new Anthropic({ maxRetries: 2 });
    } catch (error) {
      throw new AiError("ai-not-configured", `Anthropic client could not be created: ${(error as Error).message}`);
    }
    clients.set(cacheKey, client);
  }
  return client;
}

function mapError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.APIUserAbortError) return new AiError("ai-cancelled");
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AiError("ai-provider-auth", `anthropic ${error.status}`);
  }
  if (error instanceof Anthropic.RateLimitError) return new AiError("ai-provider-busy", "anthropic 429");
  if (error instanceof Anthropic.InternalServerError) return new AiError("ai-provider-busy", `anthropic ${error.status}`);
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
    // Usually a configuration problem (unknown model, unsupported parameter).
    return new AiError("ai-provider-unavailable", `anthropic ${error.status}: ${error.message}`);
  }
  if (error instanceof Anthropic.APIConnectionError) return new AiError("ai-provider-unavailable", "anthropic connection error");
  if (error instanceof Anthropic.APIError) return new AiError("ai-provider-unavailable", `anthropic ${error.status ?? "error"}`);
  // Non-HTTP SDK errors during a request (client construction is handled in getClient) mean the stream broke
  // off, e.g. "stream ended without producing a message".
  if (error instanceof Anthropic.AnthropicError) return new AiError("ai-stream-interrupted", error.message);
  return new AiError("ai-provider-unavailable", error instanceof Error ? error.message : "unknown");
}

type AnthropicMessage = Anthropic.Beta.Messages.BetaMessageParam;

/** Provider-neutral transcript → Messages API turns. Tool results go back as a user turn of tool_result blocks. */
function toAnthropicMessages(messages: ProviderMessage[]): AnthropicMessage[] {
  return messages.map((message): AnthropicMessage => {
    if (message.role === "tool") {
      return {
        role: "user",
        content: message.results.map((result) => ({
          type: "tool_result" as const,
          tool_use_id: result.toolCallId,
          content: result.content,
          ...(result.isError ? { is_error: true } : {})
        }))
      };
    }
    if (message.role === "assistant" && "raw" in message && Array.isArray(message.raw)) {
      // The exact content blocks Claude produced (text, thinking, tool_use) are sent back unchanged.
      return { role: "assistant", content: message.raw as Anthropic.Beta.Messages.BetaContentBlockParam[] };
    }
    return { role: message.role, content: message.content };
  });
}

export function createAnthropicProvider(model: string): AiProvider {
  return {
    name: "anthropic",
    model,
    async *stream(request: ProviderRequest): AsyncGenerator<ProviderEvent> {
      const client = getClient();
      const effort = anthropicOptions.effort();
      const fallbacks = anthropicOptions.fallbacksEnabled();

      try {
        const stream = client.beta.messages.stream(
          {
            model,
            max_tokens: request.maxOutputTokens,
            system: request.system,
            messages: toAnthropicMessages(request.messages),
            ...(request.tools?.length
              ? {
                  tools: request.tools.map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    input_schema: tool.inputSchema as Anthropic.Beta.Messages.BetaTool.InputSchema,
                    // Inputs are small, but stream them as generated; the server validates every input itself.
                    eager_input_streaming: true
                  }))
                }
              : {}),
            ...(effort ? { output_config: { effort } } : {}),
            ...(fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {})
          },
          { signal: request.signal }
        );

        for await (const event of stream) {
          if (event.type === "content_block_start" && event.content_block.type === "fallback") {
            // A model declined mid-answer and a fallback model continues: discard the partial text so far.
            yield { type: "reset" };
          } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield { type: "text", text: event.delta.text };
          }
        }

        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          throw new AiError("ai-refused", `anthropic refusal: ${final.stop_details?.category ?? "uncategorized"}`);
        }

        // Authoritative text: the text blocks after the last fallback switch point.
        const lastFallback = final.content.map((block) => block.type).lastIndexOf("fallback");
        const answerBlocks = final.content.slice(lastFallback + 1);
        const finalText = answerBlocks.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
        // Tool calls are only acted on after a normal tool_use stop (never after max_tokens or a refusal).
        const toolCalls: ToolCall[] =
          final.stop_reason === "tool_use"
            ? answerBlocks.flatMap((block) =>
                block.type === "tool_use"
                  ? [{ id: block.id, name: block.name, input: (block.input && typeof block.input === "object" ? block.input : {}) as Record<string, unknown> }]
                  : []
              )
            : [];

        const usage = final.usage;
        yield {
          type: "done",
          model: final.model,
          stopReason: final.stop_reason ?? null,
          finalText,
          ...(toolCalls.length ? { toolCalls, raw: answerBlocks } : {}),
          usage: {
            inputTokens: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
            outputTokens: usage.output_tokens,
            source: "provider"
          }
        };
      } catch (error) {
        throw mapError(error);
      }
    }
  };
}
