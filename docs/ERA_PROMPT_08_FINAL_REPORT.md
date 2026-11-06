# ERA Academy: Prompt 08 Final Report (AI Agent Engine and Ask ERA AI)

**Date:** 2026-11-06. **Branch:** `phase-1-foundation`.
- Nothing is committed.
- `.env` and production were not touched.
- Schema changes are additive and were applied only to the local `era-local` and `era-test` databases.

**Status legend:** ✅ implemented and tested · 🟡 partially implemented · 🔌 implemented but not tested against a real
provider · ❌ not implemented.

## 1. Architecture implemented ✅

One shared server-side engine powers three agents: Student Tutor, Teacher Assistant and Admin Platform Assistant.
Its parts are:
- authentication and authorization (reusing `authz.ts`);
- agent orchestrator;
- context manager (with a RAG seam);
- centralized prompt manager;
- provider adapters (Anthropic, OpenAI, Ollama);
- conversation manager;
- usage and cost tracking with limits;
- SSE streaming with cancellation;
- safe errors.

**Ask ERA AI** (text selection) runs on the same engine. Details are in `docs/ERA_AI_ARCHITECTURE.md` and
`docs/ERA_CONTEXTUAL_AI.md`.

## 2. Files

**Created**
- `src/server/ai/`:
  - `types.ts`, `errors.ts`, `config.ts`, `prompts.ts`, `context.ts`, `conversations.ts`, `usage.ts`, `engine.ts`,
    `sse.ts`, `access.ts`, `contextual.ts`
  - `providers/{index,anthropic,openai,ollama,http-stream}.ts`
- `src/lib/ai/agent-stream.ts` (browser SSE client) and `src/lib/ai/ask-era.ts` (shared Ask ERA config)
- `src/components/ai/ask-era-zone.tsx`
- `src/app/api/ai/chat/route.ts`, `src/app/api/ai/conversations/route.ts`,
  `src/app/api/ai/conversations/[conversationId]/route.ts`
- Tests: `tests/security/ai.test.mjs`, `tests/security/ai-adapters.test.ts`
- Docs: `docs/ERA_AI_ARCHITECTURE.md`, `ERA_AI_PROVIDER_CONFIGURATION.md`, `ERA_AI_AGENT_PERMISSIONS.md`,
  `ERA_AI_USAGE_TRACKING.md`, `ERA_AI_TEST_REPORT.md`, `ERA_CONTEXTUAL_AI.md`, and this report

**Modified**
- `prisma/schema.prisma`, `package.json` (adds `@anthropic-ai/sdk`), `.env.example`
- `src/app/api/era/chat/route.ts`, `src/app/api/era/history/route.ts`
- `src/lib/era/tutor-client.ts`, `src/lib/format.ts`, `src/server/lessons.ts`, `src/server/authz.ts`
- `src/components/classroom/classroom.tsx`, `src/components/classroom/classroom-tutor.tsx`
- `src/components/courses/practice-lab.tsx`
- `src/components/workspace/workspace-assistant.tsx`, `src/components/assistant/assistant-message.tsx`
- `src/app/teacher/assistant/page.tsx`, `src/app/admin/assistant/page.tsx`, `src/app/admin/analytics/page.tsx`
- `tests/security/{run.mjs,fake-services.mjs,fixtures.ts}`

**Removed:** `src/lib/era/provider.ts`, replaced by the adapters.

## 3. Provider integration and configuration 🔌

- **Adapters:**
  - **Anthropic:** official SDK, streaming, effort setting, and server-side refusal fallback on by default.
  - **OpenAI:** streaming Chat Completions with usage.
  - **Ollama:** streaming NDJSON.
- **Selection:** server-side via `ERA_LLM_PROVIDER` and `ERA_MODEL_NAME`. Keys are server-only. A missing
  configuration gives a safe "isn't set up yet" message. A failure never produces a fake answer.
- **Recommended default:** Anthropic Claude (`claude-opus-5-5`). The engine is not tied to it.
- **Requirements:** see `docs/ERA_AI_PROVIDER_CONFIGURATION.md`.
- **Tested:** all three adapters, against protocol-faithful fakes only.

## 4. Student Agent (ERA Tutor) ✅ (🔌 for real-model answers)

- Enrolled students only. The lesson must belong to the course. Only authorized lesson content goes into the prompt.
- Answers stream, with Stop (really cancelled server-side) and retry.
- The existing history, the video-timestamp feature and the JSON contract are preserved.
- Answers follow the user's language (Uzbek, English or Russian).
- Ask ERA AI selections join the same lesson conversation.

## 5. Teacher Agent (ERA Teaching Assistant) ✅ (🔌)

- Requires a linked teacher profile. An optional course context must be the teacher's own course, re-checked on
  every message.
- Conversations are saved and owned by the teacher, with a list and reload.
- Answers are labelled "Draft — not published". There is no automatic publishing or editing.
- Ask ERA AI works in Teacher Preview, with a popover and "Continue in the assistant".

## 6. Admin Agent (ERA Platform Assistant) ✅ (🔌)

- Admin only.
- Context is aggregate statistics only: no emails, no messages, no credentials.
- No actions, no database or SQL access.
- Saved conversations.
- Ask ERA AI works on the analytics report.

## 7. Streaming ✅

- **Transport:** SSE (`start`, `delta`, `reset`, `done`, `error`).
- **Cancellation:** on client abort or disconnect.
- **Interrupted streams:** produce an error and are never saved.
- **One client reader** is shared by all UIs.

## 8. Usage and cost tracking ✅

- **`AiUsageEvent` per request** (`SUCCESS` / `FAILED` / `CANCELLED` / `BLOCKED`), with provider-reported tokens.
- **Cost** only when a price is known; Claude prices are built in. Otherwise `null`, never invented.
- **Limits:** burst per minute, daily requests per role, daily tokens per user, answer size and history length.

## 9. Security measures ✅

- Reuses `authz.ts`, validation, rate limiting and safe errors. The engine re-checks role per agent.
- Identity and role come from the session. Conversation ownership is enforced on read and inside the save transaction.
- **Prompt-injection defence:**
  - unauthorized data is never put in the prompt;
  - reference data and selections are fenced and their tags neutralized;
  - explicit trust rules are in the system prompt.
- Errors carry no provider detail, keys or stack traces. All Prompt 07 guarantees still pass (109/109).

## 10. Database changes ✅ (additive)

- **New:** enums `AiAgent` and `AiUsageStatus`; tables `ai_conversations` and `ai_usage_events`.
- **`chat_messages`:** gains `conversation_id` and `agent`; `course_id` and `lesson_id` become nullable.
- **Existing rows:** unchanged.
- **Rollback:** documented in `ERA_AI_ARCHITECTURE.md` §9.
- **Production:** run `prisma db push` there only after a backup (manual task).

## 11. Automated test results ✅

**`npm run test:security`, fresh production build: 159/159 passed.**

| Suite | Passed |
|---|---|
| Authorization core | 12 / 12 |
| HTTP security regression | 97 / 97 |
| AI adapters | 16 / 16 |
| AI engine and Ask ERA AI | 34 / 34 |

**Browser checks:**
- Ask ERA AI: **27/27**, three consecutive runs, 0 console errors.
- Existing UI flows: **107/113**, 0 console errors. The 6 misses are timing and data issues in the script; each was
  verified directly (see `ERA_AI_TEST_REPORT.md` §3).

## 12. TypeScript, ESLint and build ✅

`tsc --noEmit` is clean. `next lint` has no warnings or errors. `next build` compiled successfully in the final
test run.

## 13. Implemented but not tested against a real provider 🔌

- Real Claude, OpenAI or Ollama answers, and their quality in Uzbek, Russian and English.
- The live refusal fallback.
- Real token and cost figures.
- Real mobile selection handles.

## 14. Remaining limitations

- No RAG yet: the tutor uses lesson notes only; transcripts and PDF text aren't indexed.
- The burst limiter is in memory, per instance.
- There is no usage dashboard page, no per-plan limits and no billing.
- Ask ERA AI can't select text inside downloaded PDFs and slides, because there is no in-app viewer.
- The `course` and `documentation` sources are configured, but no page uses them yet.
- In dev mode, a fake model answers locally (the dev server is pointed at it for testing).

## 15. Manual setup tasks

1. **Get a key and set a spend limit.** Create an Anthropic API key and set a monthly spend limit in the console.
2. **Set the environment.** In the hosting environment, set `ERA_LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`.
   Optionally set `ERA_MODEL_NAME` and the limit variables.
3. **Update the schema.** Back up the production database, then run `prisma db push`. The change is additive.
4. **Smoke-test.** Ask one question per agent, then check `ai_usage_events`.
5. **Storage (from Prompt 07).** Switch the storage bucket to private.

## 16. Recommended next phase (not started)

**Prompt 09: RAG and course knowledge.**
1. Ingest lesson notes, video transcripts and material text into pgvector.
2. Implement `KnowledgeRetriever`, always filtered by authorized course IDs.
3. Add answer citations to the lesson and video moment.
4. Add an admin AI usage page.
5. Move to a shared rate-limit store.
6. Run a staging smoke test with the real provider.
