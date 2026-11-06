# ERA Knowledge Base and Retrieval Engine (Prompt 09)

**Audience:** engineers working on ERA and the person deploying it.

**Related:** `ERA_AI_ARCHITECTURE.md` (the shared engine), `ERA_AI_AGENT_PERMISSIONS.md`, and
`ERA_KNOWLEDGE_BASE_TEST_REPORT.md` (evidence).

## 1. What it does

Teachers and admins upload PDF, DOCX, TXT or Markdown documents. ERA extracts the text, splits it into passages,
embeds them, and stores them as vectors in PostgreSQL (pgvector). When a student, teacher or admin asks one of the
three assistants a question, ERA:

1. retrieves the most relevant passages that **this user is allowed to see**;
2. gives them to the shared AI engine as labelled reference data (`[S1]`, `[S2]` …);
3. returns the answer together with its **sources**: document title, file name, page, section, and course or lesson.

If nothing relevant is found, the model is told to say that its answer is general knowledge, and no sources are
shown.

## 2. Architecture

```
                         ┌───────────────────── Admin / Teacher UI ─────────────────────┐
                         │ /admin/knowledge  /teacher/knowledge  (KnowledgeManager)       │
                         └──────────┬──────────────────────────────────────┬──────────────┘
           1. signed upload (Prompt 07)│                     list / delete / retry │
                                    ▼                                         ▼
   POST /api/admin/storage/upload ─► private bucket          /api/knowledge/documents[/id[/reprocess]]
   (folder knowledge-documents)      users/<uploader>/knowledge-documents/...
                                    │ 2. register (POST /api/knowledge/documents)
                                    ▼  validate type, MIME and magic bytes · sha256 duplicate check · scope permission
                         KnowledgeDocument (PENDING) ──after()──► ingestion pipeline (src/server/knowledge/ingest.ts)
                                                                  extract ► clean ► chunk ► embed (batches) ► store
                                                                  └► COMPLETED (chunks + vectors, one transaction)
                                                                  └► FAILED (safe error, no chunks)
                                                                              │
   ┌──────────────── question from any assistant (Tutor · Teacher · Admin · Ask ERA AI) ────────────────┐
   │ route: authentication ► role ► course/lesson access (authz.ts) ► prepareAgentRun (limits)           │
   │   ► buildKnowledgeContext (src/server/ai/knowledge.ts)                                              │
   │       ► embed the question (same model as the documents)                                            │
   │       ► ONE SQL query: cosine ranking + top-K + threshold + PERMISSION PREDICATE (src/server/knowledge/retrieval.ts)
   │   ► [S1]..[Sn] reference block ► shared AI engine (Prompt 08) ► answer + sources (saved with the message)
   └─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Module | Responsibility |
|---|---|
| `src/server/knowledge/extract.ts` | File validation (extension, MIME, magic bytes, size, UTF-8) and text extraction: PDF with `unpdf` (per page), DOCX with `mammoth` (headings kept), TXT, Markdown (headings kept, code fences respected) |
| `src/server/knowledge/chunking.ts` | Cleaning, plus configurable paragraph-aware chunking with overlap. Chunks never cross a heading and keep their PDF page range. |
| `src/server/knowledge/embeddings.ts` | The embedding provider interface and its adapters: Voyage, OpenAI, Ollama, and the deterministic test embedder. Also batching, retries and dimension validation. |
| `src/server/knowledge/ingest.ts` | The pipeline and status machine (PENDING, PROCESSING, COMPLETED or FAILED), with a transactional chunk replace |
| `src/server/knowledge/retrieval.ts` | Authorized semantic search: the permission predicate inside SQL, focus filters, ranking |
| `src/server/knowledge/access.ts` | Who may upload where, list, delete or retry |
| `src/server/ai/knowledge.ts` | RAG integration for the shared engine: context assembly, source records, citation marking |
| `src/components/knowledge/knowledge-manager.tsx` | Upload and management UI (admin and teacher) |
| `src/components/assistant/source-list.tsx` | Sources under answers (Tutor, assistants, Ask ERA popover) |

## 3. Ingestion pipeline

Upload → validation → text extraction → cleaning → metadata → chunking → embedding → vector storage → complete.

- **Validation, twice:**
  - **At upload signing:** a folder allow-list (`pdf`, `docx`, `txt`, `md`) with a matching MIME type, and at most
    25 MB.
  - **At registration:** `ERA_KB_MAX_FILE_MB` (default 20 MB) and the real bytes. A PDF must start with `%PDF-`,
    a DOCX must be a ZIP, and text must be UTF-8 with no NUL bytes.
- **Duplicates:** a SHA-256 hash of the bytes. The same file in the same scope, course and lesson (and, for private
  documents, the same uploader) returns 409, unless the earlier copy failed.
- **Background processing:** registration returns `202 PENDING`. Processing runs after the response through Next.js
  `after()`, with a conditional claim (PENDING or FAILED to PROCESSING), so a document is never processed twice at
  once. There are at most 5 attempts.
- **Chunking:**
  - `ERA_KB_CHUNK_SIZE` (default 1200 characters) and `ERA_KB_CHUNK_OVERLAP` (default 200).
  - Chunks follow paragraphs; over-long paragraphs are split at sentence and then word boundaries.
  - Each chunk stores `heading`, `pageStart`/`pageEnd`, `chunkIndex` and `charCount`.
- **Storage:**
  - Chunks and vectors are written in **one transaction** together with `COMPLETED`, `chunkCount`, `pageCount`,
    `sectionCount`, `embeddingModel` and `embeddingDimensions`.
  - Any failure sets `FAILED` with a safe `errorCode`/`errorMessage` and removes the chunks, so no orphaned vectors
    remain.
  - Deleting a document cascades to its chunks and then deletes the stored file.
- **Error codes:** `unsupported-type`, `mime-mismatch`, `file-too-large`, `empty-file`, `corrupted-file`
  (including encrypted PDFs), `no-text` (e.g. a scanned PDF with no text layer), `embedding-failed`,
  `storage-failed`, `duplicate`.

## 4. Embeddings

| Provider | `ERA_EMBEDDING_PROVIDER` | Key | Default model and dimensions | Notes |
|---|---|---|---|---|
| Voyage AI (**recommended**) | `voyage` | `VOYAGE_API_KEY` | `voyage-3.5`, 1024 | Anthropic's recommended embeddings partner; multilingual. Uses `input_type` document/query. |
| OpenAI | `openai` | `OPENAI_API_KEY` | `text-embedding-3-small`, 1536 | |
| Ollama | `ollama` | (none) | `ERA_EMBEDDING_MODEL` required | Local development |
| Test | `test` | (none) | hashing, 256 | **Automated tests only.** Lexical, not semantic. Refused when `NODE_ENV=production` unless `ERA_ALLOW_TEST_EMBEDDINGS=1` (set only by the isolated test runner). |

- **Batches:** `ERA_EMBEDDING_BATCH_SIZE` (default 64).
- **Retries:** `ERA_EMBEDDING_RETRIES` (default 2), with exponential backoff on 429, 5xx and network errors. 401 and
  other 4xx responses are not retried.
- **Validation:** every response is checked (one finite vector per input, consistent and expected dimensions).
- **Model compatibility:** every chunk stores `embeddingModel` = `provider:model:dimensions`, and retrieval compares
  only vectors with the same identifier.
- **After changing provider or model:** existing documents show as outdated, and *Retry* (`/reprocess`) re-embeds a
  COMPLETED document whose model differs. Until then, they simply aren't retrieved.

## 5. Vector storage

- **pgvector** in the existing PostgreSQL. It is available on Supabase and in `prisma dev`
  (`CREATE EXTENSION vector`, version 0.8.1 verified locally).
- **Why not Qdrant or another service:** ERA already runs PostgreSQL. Keeping vectors there means the permission
  predicate can join the real `Enrollment`, `Course` and `Lesson` tables **in the same query**, with no second system
  to secure, back up or keep in sync.
- **`knowledge_chunks.embedding` is `vector`** (no fixed dimension, so a provider change doesn't need a schema
  change).
- **Search** uses exact cosine distance (`<=>`), which is fine for thousands of passages. At larger scale, add an
  HNSW index per dimension, for example
  `CREATE INDEX ... USING hnsw ((embedding::vector(1024)) vector_cosine_ops) WHERE embedding_model = 'voyage:voyage-3.5:1024'`.
- **Writes and searches** use parameterized `$executeRaw`/`$queryRaw` only; vector literals are built from validated
  finite numbers.

## 6. Retrieval

`retrieveKnowledge(user, question, { agent, courseId?, lessonId?, documentIds?, topK?, minScore? })`:

1. embed the question with the configured provider (`purpose: query`);
2. run one SQL query over `knowledge_chunks` and `knowledge_documents`:
   - `status = COMPLETED`, the same embedding model;
   - **the permission predicate** (§7);
   - optional focus filters (course, lesson, documents), which only narrow the authorized set;
   - `1 - cosine distance >= minScore`;
   - `ORDER BY` distance, `LIMIT topK`.

**Defaults:** `ERA_KB_TOP_K=5`, `ERA_KB_MIN_SCORE=0.25`. Tune `ERA_KB_MIN_SCORE` for the chosen embedding model.

**Focus per assistant:**
- **Student Tutor:** the current course and current lesson (other lessons' documents are excluded), plus platform
  documents.
- **Teacher:** the selected course, or all their own courses, plus their private notes and platform documents.
- **Admin:** platform and all courses.

**Never throws:** if the Knowledge Base is disabled or the embedding provider fails, the assistant answers as before,
without sources.

## 7. Authorization and data isolation

Enforced **inside the retrieval SQL** (the database boundary), never by the UI or the prompt.

| Who | May retrieve |
|---|---|
| Student | Only `visibility = STUDENTS`, and only one of: `PLATFORM`; `COURSE` of a **published** course with an **enrollment row** for this user; `LESSON` whose lesson **and** course are published and the user is enrolled. **Never** `TEACHER_PRIVATE`, `TEACHERS_ONLY` (answer keys, assessments, staff policies) or draft lessons. |
| Teacher | `PLATFORM` (both visibilities); `COURSE`/`LESSON` of courses whose `instructorId` is their profile (including drafts and teachers-only); their own `TEACHER_PRIVATE`. Without a profile: platform plus their own private documents only. |
| Admin | `PLATFORM`, `COURSE`, `LESSON`. Teacher-private notes are not retrieved; admins can see their metadata and delete them for moderation. |
| A role using another role's agent | `FALSE` (fails closed) |

**Management:**

| | Upload to | List (metadata only) | Delete / retry |
|---|---|---|---|
| Admin | Platform, any course or lesson | All documents | Any |
| Teacher | Own courses and lessons; private (needs a profile) | Own courses, own private, platform (read-only) | Own courses' documents, own private (not platform) |
| Student | No | No | No |

**More protections:**
- **Registration:** only the caller's own upload path in the `knowledge-documents` folder (no traversal, no other
  users' files).
- **API responses:** never include `storagePath`, `contentHash` or passage text in management listings.
- **Sources:** contain titles, file names, pages and course/lesson names only.
- **Prompt injection inside documents:** passages are reference data. `</reference_data>` and `<document>` tags are
  neutralized to `[removed tag]`, and the shared rules say passages are never instructions. More importantly, a
  passage the user may not see is never in the prompt, so an injection can't reveal it.

## 8. Integration with the shared AI engine

- One pipeline for all agents (`buildKnowledgeContext`), called by `/api/era/chat` (Tutor and Ask ERA AI for
  students) and `/api/ai/chat` (Teacher, Admin and their Ask ERA AI). It runs after `prepareAgentRun`, so a blocked
  request never pays for an embedding call.
- Passages go into the prompt as `[S1] Title (file, page, course/lesson, section)` plus the passage text.
- The answer's `done` event and the saved assistant message carry `sources` (`ChatMessage.sources`, JSON). `cited` is
  true for labels the answer actually cites. History endpoints return them.
- **No match:** an explicit instruction to say the answer is general knowledge, with no sources.
- **Provider-independent:** works with the fake model (tests), Claude, OpenAI and Ollama.

## 9. Database changes and migrations

ERA now uses **Prisma Migrate**:
- `prisma/migrations/0_baseline`: the schema as it was before Prompt 09, generated, nothing new.
- `prisma/migrations/1_knowledge_base`: purely additive:
  - `CREATE EXTENSION vector`;
  - enums `KnowledgeScope`, `KnowledgeVisibility`, `KnowledgeStatus`;
  - tables `knowledge_documents` and `knowledge_chunks` (`embedding vector`);
  - `chat_messages.sources JSONB`;
  - indexes and foreign keys (with cascade).

**Existing databases** (created with `db push`), one time only:

```bash
npx prisma migrate resolve --applied 0_baseline   # records the baseline; runs nothing
npx prisma migrate deploy                          # applies 1_knowledge_base
```

**New databases:** `npx prisma migrate deploy`.

**Rollback:**
```sql
DROP TABLE knowledge_chunks, knowledge_documents;
DROP TYPE "KnowledgeScope", "KnowledgeVisibility", "KnowledgeStatus";
ALTER TABLE chat_messages DROP COLUMN sources;
```
Then delete the `1_knowledge_base` row from `_prisma_migrations`. Back up first; never do this automatically.

## 10. API endpoints

| Method and path | Who | Purpose |
|---|---|---|
| `POST /api/admin/storage/upload` (folder `knowledge-documents`) | Teacher, Admin | Signed one-time upload URL (existing endpoint) |
| `POST /api/knowledge/documents` | Teacher, Admin | Register an uploaded file. Returns 202 `PENDING`, or 400/403/404/409/413. |
| `GET /api/knowledge/documents[?courseId=]` | Teacher, Admin | Manageable documents (metadata) |
| `GET /api/knowledge/documents/[id]` | Teacher, Admin | One document's status |
| `DELETE /api/knowledge/documents/[id]` | Owner scope or Admin | Delete the document, its vectors and its file |
| `POST /api/knowledge/documents/[id]/reprocess` | Owner scope or Admin | Retry a failed document, or re-embed an outdated one |
| `POST /api/knowledge/search` | Teacher, Admin | "Test a question": the passages ERA would retrieve for this user |
| `POST /api/era/chat`, `POST /api/ai/chat` | (unchanged permissions) | Now include `sources` in `done` |

## 11. Environment variables

See `.env.example`:
- `ERA_EMBEDDING_PROVIDER`, `VOYAGE_API_KEY` (or `OPENAI_API_KEY`), `ERA_EMBEDDING_MODEL`, `ERA_EMBEDDING_DIMENSIONS`
- `ERA_EMBEDDING_BATCH_SIZE`, `ERA_EMBEDDING_RETRIES`
- `ERA_KB_MAX_FILE_MB`, `ERA_KB_CHUNK_SIZE`, `ERA_KB_CHUNK_OVERLAP`, `ERA_KB_TOP_K`, `ERA_KB_MIN_SCORE`

`ERA_ALLOW_TEST_EMBEDDINGS` belongs to the test runner only; never set it in production.

## 12. Local development

1. Run `npx prisma dev -n era-local -d`. pgvector is included.
2. Migrate with `npx prisma migrate resolve --applied 0_baseline` (existing database only), then
   `npx prisma migrate deploy`.
3. **For real retrieval locally:** set `ERA_EMBEDDING_PROVIDER=voyage` with `VOYAGE_API_KEY`, or use `ollama` with a
   local embedding model (e.g. `ERA_EMBEDDING_MODEL=nomic-embed-text`).
4. **For UI work without keys:** `ERA_EMBEDDING_PROVIDER=test` works in `next dev` (not in production). It is
   word-overlap only.

## 13. Testing

`npm run test:security` runs everything on an isolated local database with fake services and the test embedder:
- `tests/security/knowledge-core.test.ts`: extraction from real PDF and DOCX files built in the test, invalid files,
  cleaning, chunking, embeddings (batching, dimensions, provider failures and retries against fake Voyage, OpenAI and
  Ollama), the pipeline and its failures, retrieval filters, and authorization at the database level.
- `tests/security/knowledge.test.mjs`: the HTTP upload flow, management permissions, path traversal, duplicates,
  deletion without orphans, retrieval through all three assistants with sources, no-match, embedding failure,
  injection inside documents, and Ask ERA AI.

## 14. Limitations

- **Live semantic quality is unverified:** no embedding key is configured. The test embedder proves the pipeline and
  the security, not answer quality.
- **Scanned PDFs** without a text layer fail with `no-text`; there is no OCR.
- **Background processing** runs in the same server function (`after()`). Very large documents are limited by the
  host's function time. A dedicated job queue would be the next step at scale.
- **Search is exact (no ANN index),** which is fine for this course size. See §5 for the index to add later.
- **`TEACHERS_ONLY` is per document:** a document can't mix student-visible and teacher-only content.
