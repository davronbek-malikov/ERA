# ERA Academy: Prompt 09 Final Report (Knowledge Base and Context-Aware AI Engine)

**Date:** 2026-11-06. **Branch:** `phase-1-foundation`.
- Nothing is committed.
- `.env` and production were not touched.
- Migrations were applied only to the local `era-local` and `era-test` databases.

**Status legend:** ✅ implemented and tested · 🔌 implemented, awaiting external configuration (keys) · ❌ not
implemented.

## 1. What was implemented

| Capability | Status |
|---|---|
| Upload and management of PDF, DOCX, TXT and Markdown for admins and teachers (scopes: platform, course, lesson, teacher-private; visibility: students or teachers only) | ✅ |
| Ingestion pipeline: validation, extraction (PDF pages, DOCX and Markdown headings), cleaning, configurable chunking, batched embedding, transactional storage, PENDING/PROCESSING/COMPLETED/FAILED, retries, duplicate detection, background processing | ✅ |
| Embedding interface with Voyage (recommended), OpenAI, Ollama and a deterministic test embedder; batching, retries, dimension validation, model compatibility | ✅ (🔌 live providers) |
| pgvector storage in the existing PostgreSQL | ✅ |
| Retrieval with the authorization predicate inside SQL, top-K, threshold, course, lesson and document filters | ✅ |
| One RAG pipeline in the shared engine for Tutor, Teacher, Admin and Ask ERA AI; "general knowledge" behaviour when nothing matches | ✅ |
| Source attribution (title, file, page range, section, course or lesson), saved with answers and shown in all three UIs | ✅ |
| Admin and teacher Knowledge Base screens; sources UI | ✅ |
| Live semantic quality, real LLM citations | 🔌 not verifiable without keys |
| OCR for scanned PDFs, a dedicated job queue, an ANN index | ❌ (documented as next steps) |

## 2. Architecture decisions

- **pgvector, not Qdrant.** ERA already runs PostgreSQL, and both Supabase and the local `prisma dev` support pgvector
  (0.8.1 verified). Most importantly, the permission check can join the real enrollment, course and lesson tables
  *in the same query*, with no second datastore to secure and sync.
- **Authorization inside the retrieval SQL.** The prompt asked for enforcement at the database boundary. Each role has
  a parameterized predicate, and focus filters can only narrow it.
- **The existing signed-upload flow (Prompt 07) for files.** This avoids the hosting body-size limit, and the server
  re-reads the stored bytes to verify the type and compute the content hash.
- **Background processing with Next.js `after()` plus a conditional claim.** There is no new infrastructure, the
  status is visible, and retry is available. A job queue is the scale-up path.
- **Voyage as the recommended embedding provider.** Claude has no embeddings API, and Voyage is Anthropic's
  recommended partner and multilingual. The interface keeps OpenAI and Ollama as drop-in alternatives.
- **Retrieval runs after usage limits** and never throws, so a Knowledge Base outage can't take the assistants down.
- **Prisma Migrate introduced** (as Prompt 09 required) with a baseline, so existing databases need only a one-time
  `migrate resolve`.

## 3. New and modified files

**New**
- `src/server/knowledge/`: `extract.ts`, `chunking.ts`, `embeddings.ts`, `ingest.ts`, `retrieval.ts`, `access.ts`
- `src/server/ai/knowledge.ts`
- `src/app/api/knowledge/documents/route.ts`, `.../documents/[documentId]/route.ts`,
  `.../documents/[documentId]/reprocess/route.ts`, `src/app/api/knowledge/search/route.ts`
- `src/components/knowledge/knowledge-manager.tsx`, `src/components/assistant/source-list.tsx`
- `src/app/admin/knowledge/page.tsx`, `src/app/teacher/knowledge/page.tsx`
- `prisma/migrations/0_baseline`, `prisma/migrations/1_knowledge_base`, `prisma/migrations/migration_lock.toml`
- `tests/security/knowledge-core.test.ts`, `tests/security/knowledge.test.mjs`
- `docs/ERA_KNOWLEDGE_BASE.md`, `docs/ERA_KNOWLEDGE_BASE_TEST_REPORT.md`, this report

**Modified**
- `prisma/schema.prisma`, `package.json` (adds `unpdf`, `mammoth`, dev `jszip`), `.env.example`
- `src/lib/storage.ts` (private `knowledge-documents` folder)
- `src/server/ai/{types,engine,conversations,prompts}.ts` (sources and the citation rule)
- `src/app/api/era/chat/route.ts`, `src/app/api/ai/chat/route.ts` (retrieval)
- `src/lib/ai/agent-stream.ts`, `src/lib/era/tutor-client.ts`
- `src/components/classroom/classroom-tutor.tsx`, `src/components/workspace/workspace-assistant.tsx`,
  `src/components/ai/ask-era-zone.tsx` (sources UI)
- `src/components/layout/workspace-shell.tsx` (one "Knowledge base" navigation item each for admin and teacher)
- `tests/security/{run.mjs,fake-services.mjs}`

## 4. Database changes and migrations

**`1_knowledge_base` (additive):**
- `CREATE EXTENSION vector`
- enums `KnowledgeScope`, `KnowledgeVisibility`, `KnowledgeStatus`
- tables `knowledge_documents` and `knowledge_chunks` (`embedding vector`)
- `chat_messages.sources JSONB`
- indexes and cascading foreign keys

**Existing databases:** `npx prisma migrate resolve --applied 0_baseline`, then `npx prisma migrate deploy`.
**Rollback:** see `ERA_KNOWLEDGE_BASE.md` §9.

## 5. New dependencies and services

- **Runtime:** `unpdf` 2.1.0 (PDF text by page) and `mammoth` 1.13.0 (DOCX). Both are pure JavaScript.
- **Development:** `jszip` 3.10.2 (already present through mammoth; declared because the tests use it).
- **Services:** no new service. pgvector is a PostgreSQL extension. Embedding providers are external APIs, configured
  by environment variables.

## 6. API endpoints

**New**
- `POST /api/knowledge/documents`: register.
- `GET /api/knowledge/documents`: list.
- `GET` and `DELETE /api/knowledge/documents/[id]`: read and delete.
- `POST /api/knowledge/documents/[id]/reprocess`: retry or re-index.
- `POST /api/knowledge/search`: test retrieval, for teachers and admins.

**Modified (permissions unchanged)**
- `/api/admin/storage/upload`: the new `knowledge-documents` folder.
- `/api/era/chat` and `/api/ai/chat`: retrieval, and `sources` in `done`.
- History endpoints: return `sources`.

## 7. Frontend changes

- **New pages:** `/admin/knowledge` and `/teacher/knowledge` (shared `KnowledgeManager`): upload form, status with
  errors, retry, delete with confirmation, and a notice when retrieval isn't configured.
- **Sources list** under answers in the ERA Tutor, the Teacher and Admin assistants, and the Ask ERA AI popover.
- **No student document management** was added.

## 8. Security measures

- **Retrieval:** a permission predicate in SQL for every role. Students never get teacher-private, teachers-only
  (answer keys and assessments), draft or unenrolled content. Teachers are limited to their own courses and private
  notes; admins don't get teacher-private notes. Mismatched roles fail closed.
- **Uploads:**
  - two-stage validation (extension, MIME type, magic bytes, size, UTF-8);
  - only the caller's own upload path in the knowledge folder (no traversal);
  - duplicate detection;
  - rate limits.
- **Management:**
  - scope permissions on upload, delete and retry;
  - metadata-only listings (no storage paths, hashes or content);
  - deletion cascades to the vectors and removes the file;
  - failed processing leaves no orphaned vectors.
- **Prompt injection inside documents:** passages are fenced reference data with tag neutralization and explicit
  rules. Restricted passages never reach the prompt.
- **Sources:** reference only real retrieved passages. Labels the answer doesn't cite are marked as not cited.
- **Safe errors** everywhere; details stay in server logs.

## 9. Automated tests

**206/206 passed** on a fresh production build:

| Suite | Passed |
|---|---|
| Authorization core | 12 |
| HTTP security regression | 97 |
| AI adapters | 16 |
| AI engine and Ask ERA AI | 34 |
| **Knowledge Base core (new)** | **26** |
| **Knowledge Base & RAG over HTTP (new)** | **21** |

**Browser checks:**
- Knowledge Base UI: **12/12**.
- Ask ERA AI: **27/27**.
- Existing UI flows: **110/113**; the 3 known timing and data misses were re-verified directly.
- **0 console errors** in all three.

Details are in `ERA_KNOWLEDGE_BASE_TEST_REPORT.md`.

## 10. Production build

`next build` compiled successfully in the final test run. TypeScript and ESLint are clean.

## 11. Remaining limitations

- Live semantic quality and real `[S1]` citations are unverified (no keys).
- No OCR: scanned PDFs fail with `no-text`.
- Background processing shares the server function's time limit; very large documents need a job queue later.
- Exact vector search (no HNSW index yet); fine at course scale.
- Visibility is per document.

## 12. Required environment variables and keys

| Variable | Required | Notes |
|---|---|---|
| `ERA_EMBEDDING_PROVIDER` | yes, to enable retrieval | `voyage` (recommended), `openai` or `ollama` |
| `VOYAGE_API_KEY` | with voyage | From dash.voyageai.com |
| `OPENAI_API_KEY` | with openai | |
| `ERA_EMBEDDING_MODEL` / `ERA_EMBEDDING_DIMENSIONS` | optional | Defaults: voyage-3.5/1024, text-embedding-3-small/1536 |
| `ERA_KB_*` | optional | Size limit, chunking, top-K, minimum score |

Plus the Prompt 08 LLM variables (`ERA_LLM_PROVIDER`, `ANTHROPIC_API_KEY`) for real answers.

## 13. Manual verification steps

1. **Database:**
   1. Back up.
   2. Run `npx prisma migrate resolve --applied 0_baseline`, then `npx prisma migrate deploy` (this enables pgvector).
2. **Hosting:** set `ERA_EMBEDDING_PROVIDER=voyage` and `VOYAGE_API_KEY`, plus the Claude variables from Prompt 08.
   Redeploy.
3. **Teacher upload:** as a teacher, open **Knowledge base**, upload a lesson PDF to your course, and wait for
   **Ready**.
4. **Student check:**
   1. As an enrolled student, open a lesson and ask a question in different words from the document.
   2. Check that the answer cites `[S1]` and that **Sources** shows the PDF and page.
5. **Isolation:**
   1. Upload an answer key marked **Teachers only**.
   2. Confirm the student's Tutor never cites it, while the Teacher Assistant can.
6. **Tuning:** adjust `ERA_KB_MIN_SCORE` if answers miss relevant passages or include weak ones.
7. **Storage:** switch the `course-videos` bucket to private (still pending from Prompt 07). Knowledge files are stored
   there too.

Prompt 10 has not been started.
