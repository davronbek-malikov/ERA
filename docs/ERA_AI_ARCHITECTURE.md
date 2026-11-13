# ERA AI Agent Engine: Architecture (Prompt 08)

**Audience:** engineers working on the ERA codebase.

**Related documents:**
- `ERA_AI_PROVIDER_CONFIGURATION.md` covers environment and provider setup.
- `ERA_AI_AGENT_PERMISSIONS.md` covers who can use what.
- `ERA_AI_USAGE_TRACKING.md` covers usage, cost and limits.
- `ERA_CONTEXTUAL_AI.md` covers Ask ERA AI (text selection).
- `ERA_AI_TEST_REPORT.md` covers test evidence.

## 1. Overview

ERA has one shared server-side engine. It powers three agents: **Student Tutor**, **Teacher Assistant** and
**Admin Platform Assistant**. All three use the same orchestrator, prompt manager, provider adapters, conversation
manager, usage tracking and streaming. Each agent differs only in its configuration (allowed roles, instructions,
context builder).

```
Browser (Tutor panel / Teacher & Admin assistant / Ask ERA AI popup)
   │  fetch + Server-Sent Events  (src/lib/ai/agent-stream.ts)
   ▼
Route handlers
   /api/era/chat              Student Tutor (JSON or SSE)
   /api/ai/chat               Teacher / Admin (SSE)
   /api/ai/conversations      list (owner only)
   /api/ai/conversations/[id] messages (owner only)
   │
   ├─ Authentication & authorization ── src/server/authz.ts, src/server/ai/access.ts
   ├─ Ask ERA AI source checks ──────── src/server/ai/contextual.ts
   ├─ Context Manager ───────────────── src/server/ai/context.ts (authorized data only; RAG seam)
   ▼
ERA AI Agent Engine ─────────────────── src/server/ai/engine.ts
   ├─ Agent Orchestrator      prepareAgentRun / runAgent / collectAgentRun (role re-check)
   ├─ Prompt Manager          src/server/ai/prompts.ts (per-agent instructions + shared safety rules)
   ├─ Provider Adapter        src/server/ai/providers/{anthropic,openai,ollama}.ts
   ├─ Conversation Manager    src/server/ai/conversations.ts
   ├─ Usage & Cost Tracking   src/server/ai/usage.ts, src/server/ai/config.ts
   ├─ Streaming Handler       src/server/ai/sse.ts
   └─ Errors & Logging        src/server/ai/errors.ts (safe messages; details only in server logs)
```

## 2. Request lifecycle

1. **Authenticate and authorize** (route). The user comes from the signed session via `getCurrentUser()`; the role
   is re-read from the database.
   - **Student:** enrolled in the course, lesson published, and the lesson belongs to the course.
   - **Teacher:** has a linked instructor profile; a selected course must be their own.
   - **Admin:** role is ADMIN.
   - **Conversations:** must be owned by the session user and belong to the same agent.
2. **Build context** (`context.ts`). The route loads only data the user is already allowed to see:
   - **Student:** the lesson's notes.
   - **Teacher:** the outline of their own course.
   - **Admin:** aggregate statistics.

   Builders receive IDs that were authorized in step 1.
3. **Prepare** (`prepareAgentRun`):
   - Re-checks that the user's role may use the requested agent (defence in depth).
   - Resolves the configured provider; if missing, returns `ai-not-configured` with a safe message.
   - Enforces limits: burst per minute, daily requests, daily tokens. A blocked request is recorded as `BLOCKED`.

   All of this happens before any stream opens, so errors are normal HTTP responses (401/403/404/429/503).
4. **Run** (`runAgent`):
   - Builds the system prompt centrally.
   - Normalizes the history (starts with the user, alternates roles, keeps at most N turns).
   - Streams from the provider; emits `start`, then `delta`… (`reset` if a fallback model took over), then `done`
     or `error`.
5. **Persist on completion only.** The user turn and the assistant turn are written in **one transaction**, after
   the provider finished and only if the answer is non-empty. A failed, interrupted or cancelled answer saves
   nothing.
6. **Record usage.** Every outcome is recorded: `SUCCESS`, `FAILED`, `CANCELLED` or `BLOCKED`, with
   provider-reported tokens and duration (`usage.ts`).

## 3. Agents

| Agent | Enum | Allowed roles (engine) | Route-level rules | Context | Persistence |
|---|---|---|---|---|---|
| Student Tutor | `STUDENT_TUTOR` | STUDENT | Enrollment, published lesson, lesson ∈ course | Lesson notes, optional Ask ERA source | `ChatMessage` thread per (student, lesson), as before |
| Teacher Assistant | `TEACHER_ASSISTANT` | INSTRUCTOR, ADMIN | Linked instructor profile; course must be their own | Course outline (optional) | `AiConversation` and `ChatMessage` |
| Admin Platform Assistant | `ADMIN_ASSISTANT` | ADMIN | None | Aggregate statistics (no personal data) | `AiConversation` and `ChatMessage` |

The agents have **no tools and no write access**. The Teacher Assistant produces drafts; the Admin Assistant
explains. Changes always go through the existing permission-checked admin and teacher pages.

## 4. Provider adapters

All adapters implement `AiProvider.stream(request) → AsyncGenerator<ProviderEvent>`:
- `text` events carry the answer as it streams.
- `reset` is optional and discards partial text when a fallback model takes over.
- Exactly one `done` event follows, with `{usage, stopReason, model, finalText?}`.
- On failure the adapter throws an `AiError` with a safe code.

| Adapter | Transport | Usage | Cancellation | Notes |
|---|---|---|---|---|
| `anthropic` | Official `@anthropic-ai/sdk`: `client.beta.messages.stream()` with `finalMessage()` | Provider-reported (input includes cache tokens) | `AbortSignal` passed to the SDK | Effort configurable (default `medium`). Server-side refusal fallback on by default (`fallbacks: "default"`). A whole-chain refusal becomes `ai-refused`. Typed SDK errors are mapped. |
| `openai` | Chat Completions, SSE (`stream_options.include_usage`) | Provider-reported | Fetch `AbortSignal` | Key from `OPENAI_API_KEY` (legacy `ERA_API_KEY` also works) |
| `ollama` | `/api/chat`, NDJSON | `prompt_eval_count` / `eval_count` | Fetch `AbortSignal` | Local development only |

A stream that ends without its completion marker raises `ai-stream-interrupted` in every adapter. The engine
never treats it as an answer.

## 5. Prompt management and prompt-injection defence

- `prompts.ts` is the only place system prompts are built. Each agent has its own instructions, capabilities,
  output expectations and language rule.
- **Language:** the agent replies in the language the user writes in (Uzbek, English or Russian). If that is
  unclear, it uses the user's interface language.
- **Reference data** (lesson notes, course outline, statistics) is rendered as escaped `<document>` blocks inside
  `<reference_data>`. Any `<reference_data>` or `<document>` tags inside the data are neutralized to `[removed tag]`.
- **Ask ERA AI selections** are fenced as `<selected_text>` / `<surrounding_text>` in the user turn, and the same
  neutralization applies.
- **Shared safety rules** state that reference data, selections and user text are information, never
  instructions. They also cover: no role changes, no other users' data, no revealing instructions.
- **The decisive control is authorization, not the prompt.** Data the user may not see is never put into the
  prompt, so a successful injection cannot reveal it. The tests assert this on the exact request sent to the
  provider.

## 6. Context management and the future RAG seam

`context.ts` defines `KnowledgeRetriever.retrieve(query, scope, limit)`, where `scope` is the list of course IDs
the user has already been authorized for. Prompt 08 ships the interface and a no-op retriever (`noRetrieval`).

Prompt 09 can add:
1. ingestion of lesson notes, transcripts and materials into a vector store (e.g. pgvector);
2. a retriever whose query is always filtered by `scope`;
3. one extra call in the route before `prepareAgentRun`.

No other part of the engine changes.

## 7. Streaming

- **Transport:** Server-Sent Events over a `ReadableStream` response (`sse.ts`). Each frame is
  `event: <type>` followed by `data: <json>`. Headers are `Cache-Control: no-store` and `X-Accel-Buffering: no`.
- **Cancellation:** the browser's `AbortController` (Stop button) closes the request. Either `request.signal` or
  the stream's `cancel()` aborts the provider call. The engine records `CANCELLED` and saves nothing.
- **Interruption:**
  - A provider stream that breaks produces an `error` event with `ai-stream-interrupted`, and nothing is saved.
  - A client stream that closes without `done` is reported to the UI as interrupted.
  - The UI removes the unsaved question from the thread and offers a retry.
- **Errors in a stream** carry `{code, message, retryable}`. The message is always the fixed safe text; details go
  to the server log (`[ai-engine] …`).
- **Browser client:** `src/lib/ai/agent-stream.ts` (`streamAgent`) is shared by the Tutor, the Teacher and Admin
  assistants, and Ask ERA AI.

## 8. Conversations

| Agent | Storage | Ownership check |
|---|---|---|
| Student Tutor | `ChatMessage(userId, lessonId, agent = STUDENT_TUTOR, conversationId = null)`, unchanged from before | `userId` = session user. Lesson access is re-checked on every request. |
| Teacher / Admin | `AiConversation(userId, agent, title, courseId?)` with `ChatMessage(conversationId)` | `findFirst({ id, userId, agent })`. Anything else is 404, including inside the save transaction. |

`GET /api/ai/conversations?agent=` lists the user's 50 most recent conversations. `GET /api/ai/conversations/[id]`
returns the messages, oldest first.

## 9. Database changes

All changes are additive and applied with `prisma db push`, like the rest of the project:
- **New enums:** `AiAgent`, `AiUsageStatus`.
- **New models:** `AiConversation`, `AiUsageEvent`.
- **`ChatMessage`:** gains nullable `conversationId`, `agent` (default `STUDENT_TUTOR`), and an index. `courseId`
  and `lessonId` become **nullable**, because Teacher and Admin turns have no lesson.

Existing rows keep their values and stay valid. Nothing is dropped or rewritten.

**Rollback:**
1. Deploy the previous code.
2. The new tables and columns can stay; the old code ignores them.
3. If they must be removed:
   ```sql
   DELETE FROM chat_messages WHERE conversation_id IS NOT NULL;
   ALTER TABLE chat_messages DROP COLUMN conversation_id, DROP COLUMN agent;
   ALTER TABLE chat_messages ALTER COLUMN course_id SET NOT NULL, ALTER COLUMN lesson_id SET NOT NULL;
   DROP TABLE ai_usage_events, ai_conversations;
   DROP TYPE "AiAgent", "AiUsageStatus";
   ```
   Do this only after a backup, and never automatically against production.

## 10. Endpoints

| Method and path | Who | Body / query | Response |
|---|---|---|---|
| `POST /api/era/chat` | Enrolled student | `{lessonId, courseId?, question \| selection, timestampSeconds?, stream?}` | JSON `{ok, answer, messages}`, or SSE when `stream: true` / `Accept: text/event-stream` |
| `GET /api/era/history?lesson_id=` | Enrolled student | | `{messages}` (own lesson thread) |
| `POST /api/ai/chat` | Teacher (with profile) / Admin | `{agent, message \| selection, conversationId?, courseId?}` | SSE |
| `GET /api/ai/conversations?agent=teacher\|admin` | Same | | `{conversations}` |
| `GET /api/ai/conversations/[id]?agent=` | Owner | | `{conversation, messages}` |

SSE events:
- `start {conversationId, provider, model}`
- `delta {text}`
- `reset`
- `done {conversationId, messages[2]}`
- `error {code, message, retryable}`

The removed `src/lib/era/provider.ts` (non-streaming Ollama/OpenAI calls) is fully replaced by the adapters.


## Structured tools and confirmed actions (Student Management)

The engine supports tool calls for Anthropic, OpenAI and Ollama (`ToolDefinition`, `ProviderMessage`, `done.toolCalls`).

- **Tool loop:** a run takes up to 6 tool steps. Read tools run immediately with the user's own scope.
- **Proposals:** `propose_*` tools only create an `ai_pending_actions` row with a preview. The user confirms it with a button (`POST /api/ai/actions/:id`). It then runs once, with the user's current permissions, and is audited with source AI.
- **Prompt:** when tools are present, the system prompt swaps the "no lookups" rule for strict tool rules and adds today's date in the platform timezone.

Details: `docs/ERA_STUDENT_MANAGEMENT.md` §8.
