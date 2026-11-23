# ERA AI: Test Report (Prompt 08, including Ask ERA AI)

**Date:** 2026-11-06. Every number below comes from a run that actually happened. Items that weren't run are listed
under "Not tested".

## 1. How to run

```bash
npx prisma dev -n era-test -d          # once: isolated local Postgres
npm run test:security                  # schema sync → fixtures → production build (.next-test) → 4 suites
npm run test:security -- --skip-build  # reuse the last build
```

**Isolation**
- **Database:** local only (`localhost:51218`). The runner refuses any other host, and the fixture reset refuses any
  database that holds non-test accounts.
- **AI provider:** a fake model server (`tests/security/fake-services.mjs`) speaks the Ollama, Anthropic and OpenAI
  streaming protocols and records every request, including the full system prompt.
- **No real keys and no paid calls.**
- **Provider of the app under test:** Ollama-compatible (the fake), model `security-test-model`.

## 2. Automated results: final run on a fresh production build

| Suite | File | Tests | Passed | Failed |
|---|---|---|---|---|
| Authorization core (Prompt 07) | `tests/security/authz.test.ts` | 12 | **12** | 0 |
| HTTP security regression (Prompt 07) | `tests/security/api.test.mjs` | 97 | **97** | 0 |
| AI provider adapters (direct) | `tests/security/ai-adapters.test.ts` | 16 | **16** | 0 |
| AI engine security and integration, plus Ask ERA AI (HTTP) | `tests/security/ai.test.mjs` | 34 | **34** | 0 |
| **Total** | | **159** | **159** | **0** |

The build compiled successfully in the same run. `tsc --noEmit` and `next lint` are clean.

### Required scenarios (Prompt 08 §10)

| # | Scenario | Result | Test |
|---|---|---|---|
| 1 | Signed out → any agent | 401 on `/api/ai/chat` (teacher and admin), on conversation list and read, and on the tutor stream | AI 1–4 |
| 2 | Student → Teacher Agent | 403; conversations list 403; no LLM call | AI 1–4 |
| 3 | Student → Admin Agent | 403 | AI 1–4 |
| 4 | Teacher → Admin Agent | 403; no LLM call. Teacher without a profile → Teacher Agent 403 | AI 1–4 |
| 5 | Teacher → another teacher's course context | 404 and no LLM call; with their own course, the prompt contains only course A | AI 5 |
| 6 | Student → another student's conversation | Tutor history contains only own rows; another teacher's conversation: read 404, continue 404, listed nowhere else | AI 6–7 |
| 7 | Forged role or identity | Body `role`/`userId` ignored (conversation owned by the session user); a validly signed cookie claiming ADMIN → 403 | AI 6–7 |
| 8 | Prompt injection cannot override authorization | The exact request sent to the provider contains no other course, no emails and no other conversations. The injected `</reference_data>` in lesson notes is neutralized, and the user's injection stays in the user turn. The admin context is aggregate-only. | AI 8 |
| 9 | Provider errors don't leak | SSE `error` event with a fixed message (no provider text, paths or stack); JSON path 503. Leak patterns asserted. | AI 9, 11, 12 |
| 10 | Usage limits enforced server-side | 100 events pre-seeded → 429 `ai-limit-reached`, no LLM call, `BLOCKED` row; client-sent token or cost fields ignored | AI 10 |
| 11 | Interrupted stream → no false completion | Partial deltas arrive, then `error ai-stream-interrupted`; no `done`, no saved message | AI 9, 11, 12 |
| 12 | Provider failure → safe fallback | Retryable safe error, nothing saved, `FAILED` usage row; UI offers retry | AI 9, 11, 12 |
| + | User stops generating | Client abort → provider call cancelled, `CANCELLED` row, nothing saved | AI 9, 11, 12 |
| + | Streaming | `text/event-stream`, `start` → several `delta` → `done` | AI 5 |
| + | Usage tracking | Provider-reported tokens (42/7), `usageSource=provider`, cost `null` without a price, duration recorded | AI 10 |

### Provider adapters (run against the fakes)

**Anthropic adapter (official `@anthropic-ai/sdk` 1.6.0)**
- streams text, with usage 120/30 reported by the provider;
- the request carries `output_config.effort: "medium"` and `fallbacks: "default"`, and no `temperature`;
- a refusal becomes `ai-refused`;
- a bad key becomes `ai-provider-auth`, without the provider's message;
- a provider 500 becomes a safe, retryable error;
- a cut stream becomes `ai-stream-interrupted`;
- cancellation becomes `ai-cancelled`.

**OpenAI adapter:** streams text, with usage 55/9; a cut stream becomes `ai-stream-interrupted`; a missing key
becomes `ai-not-configured`.

**Ollama adapter:** streams text, with usage 42/7; a cut stream becomes `ai-stream-interrupted`.

**Configuration**
- No provider configured → safe `ai-not-configured`.
- Anthropic defaults to `claude-opus-5-5`; OpenAI requires a model; unknown providers are rejected.
- Cost is computed only from provider-reported tokens and a known price.
- Each agent has its own system prompt, and the reference-data wrapper is sanitized.

### Ask ERA AI: server (10 tests, all passing)

- Lesson selection streams an answer and joins the lesson thread; history shows it.
- Math and code are passed through verbatim.
- An assignment selection uses the instructions and never the solution.
- A reading-material selection works.
- Unauthorized sources are refused (403/404) with no LLM call:
  - a student who isn't enrolled;
  - another course's lesson, assignment or material;
  - a lesson that doesn't match the thread;
  - another teacher's lesson;
  - an unknown report.
- Actions and sources are validated per role.
- Empty, whitespace-only and over-long selections are refused; the 4,000-character boundary is accepted.
- An injection inside the selection or the question stays fenced.
- A teacher's conversation continues, with the course scope derived from the authorized lesson.
- The admin report context is aggregate-only.

## 3. Browser checks: dev server, local DB, local fake model

### Ask ERA AI (27 checks, headless Chrome over CDP, desktop 1440 px and mobile 390 px)

**Result: 27/27 passed, 0 console errors, in three consecutive runs.**

**What was checked**
- Mouse selection shows the popup with the correct actions per role and source.
- The popup sits near the selection, inside the viewport, and the selection is preserved.
- Escape closes it; clicking away hides it.
- Whitespace-only selections and selections outside a zone show nothing.
- Alt+A and the arrow keys work.
- The long-selection notice appears.
- Near the top edge, the popup flips below the selection inside the scrollable page.
- Explain simply opens the Tutor panel with an answer and is saved to history.
- Assignment instructions get a popup; the code editor gets none.
- Mobile shows a bottom bar that fits the viewport.
- A teacher in preview gets a streamed popover and "Continue in the assistant", which opens the saved conversation.
- An admin on the analytics report gets a streamed popover.
- The users page shows no popup.

**Problems found along the way and fixed**
- The popup background was transparent: `bg-popover` isn't a token in this design system. It now uses `bg-card`,
  `shadow-panel` and `z-overlay`.
- The quote in the user's bubble showed a literal ">". It now renders as a quote.

**Earlier failures (flakiness, disclosed)**
- Two earlier runs failed the top-edge check, both straight after file edits while the dev server was
  hot-reloading. The following three runs were clean.
- Several earlier failures were test-harness issues (Windows path conversion, Chrome teardown, scroll container).
  They are fixed in the script.

### Existing UI regression flows (`qa-test.cjs`, 3 roles, 113 checks)

**Result: 107/113 passed, 0 console errors.** The script was updated for intended Prompt 08 changes:
- the tutor now answers because a provider is configured;
- the teacher suggestion text was renamed;
- practice gets a 20 s wait on a cold dev server;
- the old `/d of 3/` regex bug is fixed.

The 6 misses, each verified separately:

| Miss | Cause | Direct verification |
|---|---|---|
| "Recent feedback shows Passed 2/2" | Data accumulation: each run adds a failed starter-code submission (known since Prompt 07) | n/a |
| Teacher sign-in lands on `/teacher` | The script reads the URL mid-redirect while the dev server compiles | With routes warm: `/teacher` |
| Teacher → `/admin/users`, `/admin/subjects`, `/admin/analytics` redirected (3 checks) | Same timing: the URL settles after the script's ~1.4 s stability window | All five admin routes → `/teacher`, with no other users' emails in the HTML |
| Teacher Assistant answer | The script waited for the word "Draft", which already appears in a suggestion | Streamed answer in 2.1 s, labelled "Draft — not published"; `/api/ai/chat` 200 |

## 4. Not tested

| Area | Why | How to cover |
|---|---|---|
| **A real Anthropic, OpenAI or Ollama model** | No API keys in this environment; all responses came from fakes | After setting `ANTHROPIC_API_KEY`, ask one Tutor, one Teacher and one Admin question, and check `ai_usage_events` |
| Real Claude refusal fallback (`fallbacks: "default"`) | Needs the live API; the request shape is tested | Live smoke test |
| Real answer quality in Uzbek, Russian and English | Needs a real model | Manual review with sample lessons |
| Burst limiter across several server instances | In-memory per instance | Shared store (follow-up) |
| Real mobile devices (iOS/Android selection handles) | Emulated touch only | Manual check on a phone |
| Very large classrooms (concurrency, provider rate limits) | Out of scope | Load test with a staging key |
