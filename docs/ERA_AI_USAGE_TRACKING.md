# ERA AI: Usage and Cost Tracking (Prompt 08)

## 1. What is recorded

There is one `AiUsageEvent` row per AI request, created **by the server only** (`src/server/ai/usage.ts`).

| Field | Source |
|---|---|
| `userId`, `agent` | Session user; the agent of the endpoint |
| `provider`, `model` | Server configuration; for Claude, the model reported in the response |
| `conversationId` | Teacher/Admin conversation, when there is one |
| `inputTokens`, `outputTokens` | **Provider-reported.** Claude: `usage.input_tokens` + cache creation + cache read, and `output_tokens`. OpenAI: `prompt_tokens` / `completion_tokens`. Ollama: `prompt_eval_count` / `eval_count`. `null` when not reported. |
| `usageSource` | `provider` (counts reported by the provider) or `unavailable`. ERA does not estimate token counts. |
| `estimatedCostUsd` | `(input × price_in + output × price_out) / 1,000,000`, **only** when the provider reported the counts and a price is known. Otherwise `null`. A cost is never invented. |
| `durationMs` | Measured on the server |
| `status` | `SUCCESS`, `FAILED`, `CANCELLED` (the user stopped it) or `BLOCKED` (a limit was reached) |
| `errorCode` | Safe error code, e.g. `ai-provider-unavailable` |
| `createdAt` | Server time |

Client-supplied token or cost fields are ignored. The test suite sends them to prove this.

## 2. Prices

Built-in prices, in USD per million tokens. They are Anthropic's published first-party rates when this was
written; verify them at anthropic.com/pricing.

| Model | Input | Output |
|---|---|---|
| `claude-opus-5-5` | 4.00 | 20.00 |
| `claude-sonnet-5-5` | 2.00 | 10.00 |
| `claude-haiku-5-5` | 0.10 | 0.50 |

- Any other model has no cost figure unless you set `ERA_AI_PRICE_INPUT_PER_MTOK` and `ERA_AI_PRICE_OUTPUT_PER_MTOK`.
- The stored figure is labelled "estimated". It is not a bill.
- The authoritative spend is in the provider's console, which is also where to set the hard monthly limit.

## 3. Limits (enforced on the server, before any provider call)

1. **Burst:** `ERA_AI_REQUESTS_PER_MINUTE` per user and agent (default 8). Exceeding it returns 429 with a wait
   time. This limit lives in memory per server instance.
2. **Daily requests per role:** students 100, teachers 200, admins 200 per UTC day. Exceeding it returns 429
   `ai-limit-reached` and records a `BLOCKED` row.
3. **Daily tokens per user:** 500,000 provider-reported tokens across all agents.
4. **Answer size:** `ERA_AI_MAX_OUTPUT_TOKENS` (default 8000). **History:** 12 earlier turns.

All limits are environment variables, so a future subscription plan can raise them per plan. The natural next step
is a `plan` on the user and a lookup in `assertUsageAllowed`.

## 4. Reading usage

The Admin Assistant's context includes AI request counts per agent and status for the last 30 days. Direct queries
work too:

```sql
-- requests, tokens and estimated cost per agent, last 30 days
SELECT agent, status, count(*), sum(input_tokens) AS input, sum(output_tokens) AS output, sum(estimated_cost_usd) AS usd
FROM ai_usage_events WHERE created_at > now() - interval '30 days' GROUP BY agent, status ORDER BY agent, status;
```

## 5. Not implemented in this phase

- Billing and payments.
- Per-plan limits.
- An admin usage dashboard page.
- A shared (multi-instance) burst limiter.
