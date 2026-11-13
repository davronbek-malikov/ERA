# ERA Prompt 09: final acceptance audit

**Audience:** the ERA project owner and whoever sets up staging.
**Scope:** everything from Prompts 01–09, as committed in `972c33f` on `phase-1-foundation`.
**Not done in this audit:** no deployment, no production migration, no change to production storage or secrets, and Prompt 10 was not started.

## Summary

| Question | Answer |
|---|---|
| Safe to commit? | **Yes.** It has been committed and pushed to `phase-1-foundation` on GitHub. `main` was not changed. |
| Ready for **production staging**? | **Yes, with the manual steps in section 5.** Staging is where the unverified items below get tested. |
| Ready for **production**? | **No.** It is not yet verified with a real LLM, real embeddings, real Supabase storage or Supabase's pgvector setup. The `course-videos` bucket is also still public. |

## 1. Issues found

| # | Severity | Issue |
|---|---|---|
| 1 | High | The public course page (`/courses/[slug]`) sent every lesson's notes, quiz, subskills, video URL and file URLs to the browser in the page data, even to visitors who were not signed in. |
| 2 | Medium | Admin-only pages (overview, users, subjects, categories, instructors, analytics, assistant, knowledge) let teachers start loading the page. The redirect happened only on the client, after a `200` response. |
| 3 | Medium | Teachers who signed in were always sent to `/admin` instead of the Teacher Workspace. |
| 4 | Low | Three unused loaders in `src/server/lessons.ts` returned lesson data without checking access. Nothing called them, but they were a trap for future code. |
| 5 | High (operational) | The `course-videos` Supabase bucket is public, so anyone with an old direct link can still open its files. Several public images are stored in it, so making it private today would break them. |
| 6 | Info | 3 of 113 UI checks missed in the Prompt 09 report (see section 3). None of them is a code defect. |
| 7 | Info | No secrets or accidental files were found in the diff. `.env` is not tracked, and `.env.example` lists variable names only. |

## 2. Issues fixed

| # | Fix |
|---|---|
| 1 | `getCourseBySlug` now selects only outline fields (titles, descriptions, durations, positions, material titles). The curriculum list shows material titles without links, and the featured video is the course promo video only. A new test confirms that no lesson content, solution, file URL or draft reaches anonymous visitors or outsiders. |
| 2 | Admin pages are split into route groups: `(admin-only)`, which has a server layout that redirects non-admins with a real HTTP redirect, and `(studio)`, the pages teachers may use. URLs are unchanged. |
| 3 | Sign-in now sends teachers to `/teacher`, or to the studio page they asked for. Every role's destination was checked in the browser. |
| 4 | The unused loaders were removed. |
| 5 | Not changed, because production storage is out of scope. Instead: `scripts/storage/audit-bucket-privacy.ts` (read-only) lists exactly what would break, and `docs/ERA_STORAGE_PRIVACY_PLAN.md` gives the safe step-by-step switch, with a rollback. |

## 3. Tests and results

| Check | Result |
|---|---|
| Automated suite (`npm run test:security`): authz unit, API, browser, AI engine, KB core, KB end-to-end | **209/209 pass** (12 + 98 + 16 + 34 + 26 + 23), on a fresh production build that includes every audit fix |
| Production build (part of the suite) | Passes |
| Lint (`next lint`) | No warnings or errors |
| TypeScript (`tsc --noEmit`) | Passes |
| UI QA script (113 checks across Student, Teacher, Admin) | **112/113**, 0 console errors |
| Knowledge Base UI (browser) | 12/12 |
| Ask ERA text selection (browser) | 27/27 |
| Fresh database: `migrate deploy` | Both migrations apply, `vector` extension created, no drift |
| Existing database: `resolve 0_baseline` then `deploy` | Applied on both local databases, no drift |

**What the RAG tests cover, end to end:**
- Upload, then text extraction from real PDF, DOCX, TXT and Markdown files.
- Chunking, embeddings, pgvector storage, retrieval, and the AI answer with sources.
- Page numbers in sources, checked with a real multi-page PDF.
- Authorization inside the retrieval SQL. Students never receive teacher-private documents, teacher-only materials, answer keys, or content from courses they are not enrolled in. This holds in answers, in source lists, in saved history and in search.

**Test embeddings vs real embeddings.** All automated RAG tests use the deterministic *test* embedder, which matches by word overlap. It proves the pipeline and the authorization rules, but it does **not** prove semantic search quality. The app refuses to use it in production unless `ERA_ALLOW_TEST_EMBEDDINGS=1` is set. The real Voyage, OpenAI and Ollama adapters exist and are configured by environment variables, but none was run with a real key in this audit.

**The 3 UI checks that missed (110/113):**
- **"Recent feedback shows real practice results"** (Student): the local database had built up many runs of test data, and the check looked for one specific recent item. This is not a defect; it still misses for the same reason in the 112/113 run.
- **The other two:** these were timeouts. The dev server had been running for a long time, compiled slowly on first visit and was overloaded (one sign-in took 76 s). After a clean restart both passed. These are not defects either.

## 4. Remaining risks

1. **Real AI provider not verified.** The Anthropic, OpenAI and Ollama adapters were tested against a fake local LLM only.
2. **Real embeddings not verified.** Retrieval quality with Voyage or OpenAI is unmeasured. The minimum score (`ERA_KB_MIN_SCORE`) may need tuning.
3. **Supabase not verified:**
   - Supabase may install pgvector in the `extensions` schema instead of `public`.
   - Migrations need the direct (non-pooler) connection.
   - Real signed-URL uploads and downloads have not been run against Supabase.
4. **Public bucket.** Old direct links to lesson videos, materials and Knowledge Base files keep working until the switch in `ERA_STORAGE_PRIVACY_PLAN.md` is done.
5. **Background processing.** Document processing runs inside the request via `after()`. Very large files on a host with short limits may time out; the **Reprocess** button recovers them.
6. **The local test database** (`prisma dev`) sometimes stops responding. This is a problem with the local tool, not with the app.

## 5. Exact manual steps (staging first)

1. **Back up** the staging database.
2. **Set environment variables** in the hosting dashboard. The names are in `.env.example`; never commit the values.
   - LLM: `ERA_LLM_PROVIDER` plus that provider's key.
   - Embeddings: `ERA_EMBEDDING_PROVIDER` (Voyage recommended) plus its key.
   - Storage: the Supabase URL and service key.
3. **Migrate** using the **direct** connection string:
   - Existing database: `npx prisma migrate resolve --applied 0_baseline`, then `npx prisma migrate deploy`.
   - New database: `npx prisma migrate deploy`.
4. **Check pgvector.** Run `select extname, extnamespace::regnamespace from pg_extension where extname='vector';`. If it shows `extensions`, confirm that the database user's `search_path` includes `extensions`.
5. **Smoke test** as each role:
   - Upload a PDF to the Knowledge Base and wait for **Ready**.
   - Ask the tutor a question about it and check the sources and page numbers.
   - Confirm a student in another course cannot see it.
6. **Storage privacy:** follow `docs/ERA_STORAGE_PRIVACY_PLAN.md`, on staging first.
7. Repeat steps 1–6 on production only after staging passes.

## 6. Ready for production staging?

**Yes.** The code, tests, migrations and documentation are in place, and the known leaks found in this audit are fixed.

## 7. Safe to commit?

**Yes.** The work was committed as `972c33f` and pushed to `origin/phase-1-foundation`. The commit contains no secrets and no accidental files, and `main` is untouched. Merging into `main` should go through a pull request after staging passes.
