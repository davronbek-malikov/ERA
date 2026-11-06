# ERA Knowledge Base: Test Report (Prompt 09)

**Date:** 2026-11-06. Only executed results are listed. Everything ran locally with an isolated database, fake
storage, a fake model and the deterministic test embedder. **No live AI or embedding provider was called.**

## 1. Automated suite: `npm run test:security`, final run on a fresh production build

| Suite | Tests | Passed | Failed |
|---|---|---|---|
| Authorization core (Prompt 07) | 12 | 12 | 0 |
| HTTP security regression (Prompt 07) | 97 | 97 | 0 |
| AI provider adapters (Prompt 08) | 16 | 16 | 0 |
| AI engine and Ask ERA AI (Prompt 08) | 34 | 34 | 0 |
| **Knowledge Base core (new)** | **26** | **26** | 0 |
| **Knowledge Base & RAG over HTTP (new)** | **21** | **21** | 0 |
| **Total** | **206** | **206** | **0** |

- The production build compiled successfully, and migrations were applied with Prisma Migrate (`0_baseline` and
  `1_knowledge_base`).
- `tsc --noEmit` and `next lint` are clean.
- All 159 earlier tests pass unchanged. No existing test was weakened, skipped or rewritten. The only changes to the
  runner are the build order, the migration step, and environment variables for the new suites.

## 2. Coverage against Prompt 09 §12

| Area | What was tested | Where |
|---|---|---|
| **A. Ingestion** | PDF text with page numbers (a real two-page PDF built in the test); DOCX with headings (a real DOCX built with `jszip`); TXT; Markdown (headings, code fences); invalid files (a fake PDF, a non-ZIP DOCX, a corrupted ZIP, binary or non-UTF-8 text, empty files); declared type, MIME and size; cleaning; chunk size, overlap, heading boundaries and page ranges; over-long text; failures (corrupted, no text, embedding failure) giving FAILED with safe messages and no orphaned chunks; no concurrent double processing | core |
| **B. Embeddings** | Determinism and normalization of the test embedder; batch splitting and order; dimension validation; Voyage, OpenAI and Ollama adapters against fakes (dimensions, 3 attempts on 500, no retry on 401, wrong-dimension responses rejected); missing keys; the test embedder refused in production | core |
| **C. Retrieval** | Ranking (best match first, scores descending); top-K; course, lesson and document filters; the minimum-score threshold (empty result); vectors from another model never compared; provider failure becomes `error`; no provider becomes `disabled` | core |
| **D. Authorization** | Students only see published, enrolled-course content visible to students, plus platform documents; never teacher-private, teachers-only (answer keys), draft lessons or other courses. A teacher sees only their own courses, their private notes and platform documents; teacher B never sees A's documents. A teacher without a profile gets platform only. Admins get platform and all courses, without private notes. A role using another role's agent fails closed. | core and HTTP |
| **D. Management** | Students can't list, read, upload, delete or search (403); unauthenticated requests get 401; teachers can't upload platform documents (403) or to another teacher's course or lesson (404); private uploads need a profile; listings never include another teacher's documents; delete permissions (404/403); admins see metadata only, never content; deletion removes the record, chunks and stored file; path traversal and other users' uploads are refused; duplicates get 409; oversize gets 413; failed documents can be retried | HTTP |
| **E. AI integration** | **Student Tutor:** authorized passages are in the prompt, restricted ones are absent, and sources come back with title, file, section and course, matching labels the model actually saw; sources persist in history. **Course-B student:** only course-B knowledge. **Teacher Assistant:** own course, answer key and private notes, never course B. **Teacher B:** none of teacher A's. **Admin Assistant:** platform and courses, no private notes. **Ask ERA AI:** returns sources. **No match:** the explicit general-knowledge instruction and no sources. **Embedding failure:** an answer without sources. **Prompt injection inside a document:** neutralized, and restricted content never present. **Fake-model compatibility:** preserved. | HTTP |
| **F. Regression** | All Prompt 07 and 08 suites, the production build, the existing UI flows and the Ask ERA UI (§3) | all |

## 3. Browser checks (headless Chrome, dev server, local fakes)

| Script | Result |
|---|---|
| Knowledge Base UI (new): teacher navigation entry, scope choices, own courses only; invalid file error; upload goes to the list and reaches Ready; the student's Tutor answer shows Sources with the uploaded document; no management UI for students, and `/teacher/knowledge` redirects them; admin platform scope, sees the teacher's document, deletes it via the confirm dialog | **12/12, 0 console errors** |
| Ask ERA AI (Prompt 08) | **27/27, 0 console errors** |
| Existing UI flows (`qa-test.cjs`) | **110/113, 0 console errors.** The 3 misses are the same as in Prompt 08: data accumulation, and two checks that read the URL mid-redirect. Verified directly again: a teacher signing in lands on `/teacher`, and `/admin`, `/admin/users`, `/admin/knowledge` and `/admin/analytics` redirect them with no other users' data. |

## 4. Problems found during testing (all fixed)

| Problem | Cause | Fix |
|---|---|---|
| The test database stopped answering during full runs | The local `prisma dev` database sat idle while a long build saturated the machine | The runner now builds first, then runs migrations, fixtures and tests |
| Browser upload failed with "Failed to fetch" | The fake storage sent no CORS headers (real Supabase does) | CORS preflight handling added to the fake |
| "1 passages", "0.0 MB" | Display only | Singular and plural forms; KB for small files |
| Test-design issues | Lexical test embeddings and a fixture that contained a marker string | Fixtures use clear key terms; the threshold is set explicitly for the test run. The marker-string false alarm was checked: none of the restricted documents' content or file names reached the student. |

## 5. Not tested (honest gaps)

| Area | Why | How to verify |
|---|---|---|
| **Real semantic retrieval quality** (Voyage, OpenAI or Ollama embeddings) | No embedding key configured; the test embedder is lexical | Set `ERA_EMBEDDING_PROVIDER=voyage` and `VOYAGE_API_KEY`, upload a lesson PDF, ask questions phrased differently from the text, and tune `ERA_KB_MIN_SCORE` |
| Real model answers that cite `[S1]` | No LLM key; the fake model doesn't cite | After setting up Claude, check that the "cited" markers appear |
| Real Supabase Storage upload and download for Knowledge Base files | No live project | Upload one document on staging |
| Large PDFs (tens of MB, hundreds of pages) and function time limits | Local only | Staging test |
| Scanned PDFs (OCR) | Not supported (`no-text`) | (feature gap) |
