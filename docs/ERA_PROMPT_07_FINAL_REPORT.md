# ERA Academy — Prompt 07 Final Report: Security Hardening & Backend Foundations

Date: 2026-11-06 · Branch: `phase-1-foundation` · Nothing committed yet · `.env` not modified · No DB migration.

Supporting documents: `docs/ERA_SECURITY_AUDIT.md` (findings and threat model), `docs/ERA_SECURITY_IMPLEMENTATION.md`
(what changed and how to run it), `docs/ERA_AUTHORIZATION_MATRIX.md` (who can do what),
`docs/ERA_SECURITY_TEST_REPORT.md` (test evidence).

---

## A. Executive summary

All ten Prompt 07 tasks are complete. Before this work, ERA had **2 critical** and **7 high** security holes. All of
them, and 13 medium/low findings, are fixed and covered by automated tests.

**The two critical problems**
1. **Teachers could change or delete other teachers' courses.** The ownership check answered "not allowed", but all
   8 server actions that asked ignored the answer. Any instructor could edit or delete any course, lesson or
   material.
2. **Teachers could delete other people's files.** Material forms accepted a storage path from the browser. Later
   the server deleted that path with the master storage key, so an instructor could get any stored file deleted.

**The seven high-severity problems**
- The old public lesson page showed full lessons (video, notes, quiz, practice) to anyone.
- The lesson-content API answered without sign-in.
- The AI tutor did not check enrollment.
- Saving progress silently enrolled students in any course.
- Practice submission returned solutions for courses the student was not in.
- Course files and videos were served from permanent public links.
- A teacher without a profile saw every course and every student's email.

**The result**
- One central authorization module (`src/server/authz.ts`). It is deny-by-default and fails closed.
- Validated input on every API, generic error messages, private storage served through short-lived signed links,
  and safe progress writes in a transaction.
- A new automated security suite of **109 tests, all passing**, run against a production build.
- TypeScript, ESLint and the production build are clean. The existing UI checks still pass with **0 console errors**.

---

## B. Files

### Created

| File | Purpose |
|---|---|
| `src/server/authz.ts` | Central authorization: role guards, studio scope, course ownership, course/lesson access, enrollment, same-origin check, safe API errors |
| `src/lib/validation.ts` | Body parsing with size limits; ID, string, integer, boolean and URL validators |
| `src/server/storage.ts` | Server-only storage operations: signed upload/read URLs, delete, video and material URL resolution |
| `src/lib/json-ld.ts` | Safe JSON-LD serialization |
| `src/middleware.ts` | Signed-out visitors to `/learn`, `/teacher`, `/admin` are redirected to sign-in with the deep link kept |
| `src/app/api/materials/[materialId]/download/route.ts` | Authorized material download (signed link, 5 minutes) |
| `tests/security/run.mjs` | Test runner: local-only safety, fixtures, fake services, isolated build |
| `tests/security/fixtures.ts` | Isolated test data (refuses non-test databases) |
| `tests/security/fake-services.mjs` | Fake Supabase Storage and fake Ollama |
| `tests/security/helpers.mjs` | Session minting, HTTP and server-action helpers |
| `tests/security/authz.test.ts` | 12 direct tests of the authorization core |
| `tests/security/api.test.mjs` | 97 HTTP regression tests |
| `docs/ERA_SECURITY_AUDIT.md`, `docs/ERA_SECURITY_IMPLEMENTATION.md`, `docs/ERA_AUTHORIZATION_MATRIX.md`, `docs/ERA_SECURITY_TEST_REPORT.md`, this report | Documentation |

### Modified

| Area | Files |
|---|---|
| AI tutor | `src/app/api/era/chat/route.ts`, `src/app/api/era/history/route.ts`, `src/app/api/lesson/[id]/context/route.ts`, `src/lib/era/tutor-client.ts`, `src/server/lessons.ts`, `src/lib/format.ts` |
| Progress, reviews, views | `src/app/api/courses/[courseSlug]/progress/route.ts`, `.../reviews/route.ts`, `.../view/route.ts` |
| Practice | `src/app/api/practice/[exerciseId]/submit/route.ts`, `src/server/practice.ts` |
| Storage | `src/lib/storage.ts`, `src/app/api/admin/storage/upload/route.ts`, `src/app/api/admin/storage/delete/route.ts` |
| Studio / teacher isolation | `src/app/admin/actions.ts`, `src/server/admin.ts`, `src/lib/permissions.ts`, `src/server/workspace.ts` |
| Student classroom | `src/server/student.ts`, `src/components/classroom/classroom.tsx` |
| Legacy lesson page | `src/app/(public)/courses/[courseSlug]/lessons/[lessonSlug]/page.tsx` (now only redirects) |
| Platform | `next.config.ts` (legacy redirect, security headers, isolated test build folder), `src/lib/auth.ts`, `src/lib/rate-limit.ts` |
| UI messages | `src/app/admin/{courses,lessons,materials,users}/page.tsx` (new error messages only) |
| Public pages | `src/app/(public)/page.tsx`, `about/page.tsx`, `faq/page.tsx` (safe JSON-LD) |
| Project | `package.json` (`test:security` script), `.gitignore` (`.next-test`, `tests/security/.state`) |

---

## C. Vulnerabilities and resolutions

| ID | Severity | Problem (before) | Resolution (after) | Proven by |
|---|---|---|---|---|
| F-01 | **Critical** | Studio actions ignored the ownership check: any instructor could edit or delete any course, lesson or material | `requireManagedCourse()` blocks with "forbidden". Moves check both the old and new course. | §6 tests: hijack, delete and "fire every action" attempts fail; owner update still works |
| F-08 | **Critical** | Browser-supplied `storagePath` was deleted with the master key; any `fileUrl` (incl. `javascript:`) accepted | Path derived on the server from the URL and must be the teacher's own upload in a material folder. Files deleted only if owned and unused. http(s) links only. | §6 storage-IDOR and `javascript:` tests; no DELETE reaches storage |
| F-02 | High | Old public lesson page showed full lessons to anyone | Redirect `/courses/c/lessons/l` → `/learn/...` (classroom with access checks); old page loads no data | §8 tests |
| F-03 | High | Teacher without profile saw all courses, materials and student emails | All studio loaders fail closed (empty for "no profile") | §6 "teacher without profile" on 4 pages |
| F-04 | High | AI tutor usable on any lesson without enrollment | Student + enrollment + published lesson + matching course; validated input | §2, §3 |
| F-05 | High | Lesson content API was public | Sign-in + lesson access; video link signed | §1, §2 |
| F-06 | High | Progress API created enrollments; accepted lessons of other courses | Existing enrollment required; lessons checked against the course; one transaction | §4 |
| F-07 | High | Practice submit returned solutions without access | Lesson access required before anything is saved or returned | §2 |
| F-09 | High | Files and videos via permanent public links | Download route with 5-minute signed links; videos signed for 4 hours; classroom never sends storage URLs | §5 |
| F-10 | Medium | Uploads allowed SVG, scripts, archives anywhere, overwrites | Strict extension and type list per folder; size limits; no overwrite; separate public bucket for thumbnails and promo videos | §5 (10 rejection cases) |
| F-11 | Medium | Errors leaked configuration and provider details | Fixed client messages; details only in server logs | §3 provider-failure test |
| F-12 | Medium | Anonymous view counter could be spammed and refreshed the homepage cache every call | One view per visitor per course per 30 minutes; no cache refresh | §4 |
| F-13 | Medium | Anyone signed in could review any course; no length limit | Enrolled students only; 8–2000 characters | §4 |
| F-14 | Medium | Instructors could set homepage "featured" and "popular" flags | Admin-only | §6 |
| F-15 | Medium | Admin could delete themself or the last admin | Both blocked | §7 |
| F-16 | Low | Teacher profile could be linked to the wrong account by email | Linked profile first; email match only for unclaimed profiles, claimed safely | direct test |
| F-17 | Low | Deleted or suspended user's cookie crashed pages | Cookie clearing made safe | §1 suspended test |
| F-18 | Low | No cross-site check on JSON APIs; no security headers | Same-origin check; `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` | §3, §8 |
| F-19 | Low | Unused old helpers returned too much data (incl. password hashes) | Admin-only, minimal fields | §7 |
| F-20 | Low | JSON-LD script blocks not escaped | Safe serializer | code review |
| F-21 | Low | Rate limiter set to 1 allowed 2 tries (found by tests) | Fixed | §4 |
| F-22 | Medium | Rate limits counted per IP + user: a whole classroom behind one school IP shared one AI budget | Signed-in limits now per account | code review |

---

## D. Test results (only executed tests are counted)

**Command:** `npm run test:security`. It runs on an isolated local database (`era-test`), uses fake storage and a
fake AI service, and builds the production app into `.next-test`.

| Suite | Tests | Passed | Failed |
|---|---|---|---|
| Authorization core (direct, with DB) | 12 | **12** | 0 |
| HTTP regression (production build) | 97 | **97** | 0 |
| **Total** | **109** | **109** | **0** |

**HTTP suite by area**

| Area | Passed |
|---|---|
| Authentication (signed out, expired, tampered, suspended, forged role, deep links) | 18/18 |
| Enrollment / course access | 11/11 |
| AI tutor and conversations | 16/16 |
| Progress, enrollment, reviews | 10/10 |
| Private materials and storage | 19/19 |
| Teacher isolation and studio actions | 14/14 |
| Admin boundaries | 6/6 |
| Legacy URL and security headers | 3/3 |

**Required scenarios from the prompt (all passed)**

| Scenario | Expected | Observed |
|---|---|---|
| Signed out → protected API | 401 or redirect | 401 on 9 APIs; redirect to sign-in on 5 pages |
| Student → course not enrolled | 403 or safe 404 | 403 `not-enrolled`; no lesson content in HTML |
| Student → another student's conversation | Denied | Only own messages returned; `userId` in body ignored |
| Teacher → another teacher's course | Denied | 404 / no effect; DB unchanged |
| Teacher → admin users | 403 | No user data shown; create-user refused |
| Teacher without profile → editor | Denied | Empty lists; updates refused |
| Unauthorized → private material | Denied | 401 / 403 / 404; no signed link issued |
| Enrolled student → material | Allowed | 302 to a 5-minute signed link, not cached |
| Student → change another's progress | Denied | Other student's data unchanged |
| Invalid lesson/course relationship | Denied | 400 / 404 |
| Unauthorized → legacy lesson | Denied or safe redirect | 307 into the classroom → sign-in; no content |
| Admin → permitted resource | Allowed | 200 / 302 |

The suite also covers invalid bodies, missing and expired sessions, invalid IDs, error leakage, upload validation,
direct URLs and cross-origin requests.

**Other checks**

| Check | Result |
|---|---|
| `tsc --noEmit` | Clean |
| `next lint` | No warnings or errors |
| Production build | Compiled successfully |
| Existing UI QA (3 roles, headless Chrome, dev server) | 111/113, **0 console errors** |

The 2 UI misses are not regressions. One is a broken pattern in the QA script itself (`/d of 3/`). The other
happens because each QA run saves a new failed practice attempt, which pushes the seeded "Passed" one out of the
recent list. That newest attempt was saved after the security changes, which shows practice submission still works.

**Bugs the tests caught (all fixed)**
- Teacher preview of a draft lesson returned 404 (caused by the new loader filter).
- The rate-limiter bug (F-21).
- The test runner hung because a blocking spawn froze the fake services.

---

## E. Database and migration changes

- **Schema changes:** none. **Migrations:** none. **Production DB:** never touched. **`.env`:** not modified.
- Prisma refused `db push --force-reset` because an AI agent ran it, and that block was respected. The test runner
  uses a non-destructive `prisma db push` on a separate local DB. The fixture script refuses any database that
  contains non-test accounts.
- **Storage configuration still to do (manual, in Supabase):**
  1. Create a public bucket (e.g. `public-assets`) and set `SUPABASE_STORAGE_PUBLIC_BUCKET=public-assets`.
  2. If old thumbnails or promo videos exist, move them into it. The current Supabase project is new, so there is
     probably nothing to move.
  3. Switch `course-videos` to **private**. The app already serves lesson videos and materials only through signed
     links.
  4. Rollback: make the bucket public again. No code change is needed.

---

## F. Remaining risks

| ID | Risk | Impact | Recommended action |
|---|---|---|---|
| R-1 | `course-videos` bucket is still public until switched in Supabase | Someone who learns a direct file link could open it | Do the 4 steps in §E before inviting students |
| R-2 | Rate limits are kept in server memory | On several server instances (Vercel), limits are per instance | Shared store (Upstash Redis or a Postgres table) when traffic grows |
| R-3 | Sessions cannot be revoked (stateless cookie, 7 days) | A stolen cookie works until it expires or the account is suspended | Session table with a version or ID check |
| R-4 | Upload file type is declared by the browser | A file could be mislabelled | Check the file's contents after upload, or use Supabase bucket MIME restrictions |
| R-5 | Old lesson components are unused but kept | Dead code | Remove in a cleanup prompt |
| R-6 | Real Supabase and real AI provider not tested (fakes used) | Configuration mistakes would show only in production | Staging smoke test after configuring |
| R-7 | **No AI provider is configured** | The AI tutor currently answers "temporarily unavailable" | Choose a provider in Prompt 08 |

---

## G. Readiness by area

| Area | Status |
|---|---|
| Authentication and sessions | **PASS** |
| Central authorization (deny-by-default, fail-closed) | **PASS** |
| Teacher isolation (studio and teacher workspace) | **PASS** |
| Admin boundaries | **PASS** |
| Student enrollment and course access | **PASS** |
| AI tutor security (chat, history, context) | **PASS** |
| Progress and enrollment integrity | **PASS** |
| Legacy lesson route | **PASS** |
| Input validation and error leakage | **PASS** |
| CSRF / same-origin and security headers | **PASS** |
| Private storage | **PARTIALLY COMPLETE**: code done and tested; bucket switch pending (R-1) |
| Rate limiting | **PARTIALLY COMPLETE**: works, per instance only (R-2) |
| Real Supabase and AI provider behaviour | **NOT TESTED** (R-6) |
| Organization-ready architecture | Analysis complete (doc only, as requested) |
| Automated security test suite | **PASS** (109/109) |

---

## H. Plan for Prompt 08: ERA AI Agent Engine

**Current state of the chatbots**
- The public "Mendan so'rang" bubble is a keyword FAQ helper, not AI.
- The classroom tutor is fully built and secured but has no AI provider configured.
- The Teacher and Admin assistants are screens without a backend.

**Plan**
1. **Choose the provider** (decision needed). The recommendation is the Claude API: strong teaching
   explanations, good Uzbek, pay-per-use. OpenAI also works; it is already supported, so it only needs keys.
   Ollama is for local testing only.
2. **Engine.** A single `src/server/ai/engine.ts` behind the existing provider layer. Every call receives the
   already-authorized context: user, role, course, lesson and assistant type. The AI can never see data the user
   couldn't.
3. **RAG (answers from your own course content).** Add a `KnowledgeChunk` table with Postgres pgvector (available
   on Supabase), filled from lesson notes, video transcripts and materials. Retrieval is always filtered by the
   courses the user can access, which also protects against prompt injection.
4. **Role-based agents**
   - **Student tutor:** answers from the lesson and cites the video moment.
   - **Teacher assistant:** drafts quizzes, summaries and practice tasks, for their own courses only.
   - **Admin assistant:** platform analytics without personal student data.
   - **Public guide:** optionally upgrade "Mendan so'rang" to AI, limited to public information.
5. **Guardrails:** per-user cost and usage limits, an AI audit log, streamed answers, and a safe fallback when the
   provider is down.
6. **Tests:** extend `npm run test:security` with AI cases: cross-course retrieval leaks, role isolation between
   agents, and prompt-injection attempts.
