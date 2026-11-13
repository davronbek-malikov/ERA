# ERA AI: Provider Configuration (Prompt 08)

**Audience:** whoever deploys or operates ERA Academy, which today is the course owner.

ERA can use **Anthropic Claude** (recommended), **OpenAI** or **Ollama** (local development only). The provider and
model are chosen on the server from environment variables. Users and browsers can't choose them, and keys never
reach the browser.

## 1. Recommended setup: Claude

The original code supported only Ollama, which runs on your own computer and can't serve students online, and
OpenAI. For the course launch, **Claude** is recommended:
- it writes strong step-by-step teaching explanations;
- it handles Uzbek, English and Russian well;
- it reports token usage, so cost tracking is exact;
- it has a built-in refusal fallback;
- you pay per use, with no fixed cost.

The engine doesn't depend on Claude. Switching provider means changing two variables.

```env
ERA_LLM_PROVIDER="anthropic"
ANTHROPIC_API_KEY="<your key from console.anthropic.com>"
# Optional; default is claude-opus-5-5
ERA_MODEL_NAME=""
```

**Setup steps (manual):**
1. Create an API key in the Anthropic Console (console.anthropic.com).
2. Set a monthly spend limit there.
3. Add the variables to the hosting provider's environment (e.g. Vercel → Settings → Environment Variables).
   **Never commit `.env`.**
4. Redeploy.
5. Open a lesson as an enrolled student and ask the Tutor a question. Then check `ai_usage_events` (or the admin
   assistant's statistics) for a `SUCCESS` row.

**Claude options:**

| Variable | Default | Meaning |
|---|---|---|
| `ERA_MODEL_NAME` | `claude-opus-5-5` | Any current Claude model ID, e.g. `claude-sonnet-5-5` (cheaper) or `claude-haiku-5-5` (cheapest). Only change it after checking answer quality. |
| `ERA_AI_EFFORT` | `medium` | `low` / `medium` / `high` / `xhigh` / `max`. Higher means more thorough and more expensive. An empty string omits the parameter, which some older models need. |
| `ERA_AI_ANTHROPIC_FALLBACKS` | on (`default`) | Server-side refusal fallback: if a safety classifier declines, Claude retries on a fallback model in the same call. Set `off` to disable. |
| `ANTHROPIC_BASE_URL` | Anthropic API | Only for proxies or tests. |

## 2. OpenAI

```env
ERA_LLM_PROVIDER="openai"
ERA_MODEL_NAME="<model id>"     # required
OPENAI_API_KEY="<key>"          # ERA_API_KEY is still accepted for older setups
OPENAI_BASE_URL=""              # optional, for compatible gateways
```

## 3. Ollama (local development)

```env
ERA_LLM_PROVIDER="ollama"
ERA_MODEL_NAME="llama3.1"       # any model you have pulled; required
OLLAMA_BASE_URL="http://127.0.0.1:11434"
```

Ollama has no API key and no cost. Ollama is not suitable for production unless you host the model server.

## 4. Limits and cost (all optional)

| Variable | Default | Meaning |
|---|---|---|
| `ERA_AI_MAX_OUTPUT_TOKENS` | 8000 | Maximum size of one answer (on Claude this includes thinking) |
| `ERA_AI_MAX_HISTORY_MESSAGES` | 12 | Earlier turns sent with each request |
| `ERA_AI_REQUESTS_PER_MINUTE` | 8 | Burst limit per user (in memory, per server instance) |
| `ERA_AI_DAILY_REQUESTS_STUDENT` / `_TEACHER` / `_ADMIN` | 100 / 200 / 200 | Requests per user per UTC day |
| `ERA_AI_DAILY_TOKENS_PER_USER` | 500000 | Provider-reported tokens per user per UTC day |
| `ERA_AI_PRICE_INPUT_PER_MTOK`, `ERA_AI_PRICE_OUTPUT_PER_MTOK` | (none) | USD per million tokens. Overrides the built-in Claude prices; required to get cost figures for OpenAI or Ollama models. |

## 5. Failure behaviour

| Situation | What the user sees | What happens on the server |
|---|---|---|
| `ERA_LLM_PROVIDER` missing or invalid | "The AI assistant isn't set up yet. Please contact the administrator." (503) | The reason is logged as `[ai-chat] ai-not-configured: …` |
| Wrong or expired key | "The AI assistant is temporarily unavailable. Please contact the administrator." | `ai-provider-auth` is logged. Nothing is saved; usage is recorded as `FAILED`. |
| Provider overloaded or rate-limited | "Busy right now, try again in a minute" (retry offered) | `ai-provider-busy` |
| Network or provider outage | "ERA is temporarily unavailable" (retry offered) | `ai-provider-unavailable` |
| Stream cut mid-answer | "The answer was interrupted and wasn't saved" | `ai-stream-interrupted`; no partial answer is stored |
| Safety refusal (after fallback) | "ERA can't help with that request…" | `ai-refused` |
| Daily limit reached | "You've reached today's AI usage limit" (429) | A `BLOCKED` usage row is recorded |

ERA never pretends to answer when the provider fails. No answer is fabricated or saved.

## 6. Security notes

- Keys are read only in `src/server/ai/*`, which is server-only. They are never logged, never returned and never
  bundled for the browser.
- The model and provider are not influenced by request bodies.
- Error messages are fixed strings; provider responses and stack traces stay in server logs.


## Groq (added)

Set `ERA_LLM_PROVIDER=groq` and `GROQ_API_KEY`. Groq uses the OpenAI Chat Completions protocol, so it runs through the OpenAI adapter with `https://api.groq.com/openai/v1`; `GROQ_BASE_URL` can override that address.

The default model is `openai/gpt-oss-120b`, which supports tool calling, so the Student Management tools work. Set `ERA_MODEL_NAME` to use a different model.

Groq doesn't provide embeddings, so the Knowledge Base still needs `ERA_EMBEDDING_PROVIDER` (Voyage or OpenAI). Without it, retrieval stays off and the assistants answer without document sources.
