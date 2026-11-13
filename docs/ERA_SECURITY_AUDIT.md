# ERA Academy — Security Audit (Prompt 07, Task 1)

Status: **audit of the code as it was before Prompt 07 changes** (branch `phase-1-foundation`, after commit `0584df6` plus the uncommitted Prompt 03–06 work).
The fixes for each finding are described in `docs/ERA_SECURITY_IMPLEMENTATION.md`; the resulting rules are in
`docs/ERA_AUTHORIZATION_MATRIX.md`; the evidence is in `docs/ERA_SECURITY_TEST_REPORT.md`.

Severity scale: **Critical** (any account can take over or destroy other people's data) · **High** (cross-tenant data
read or write, paid content without enrollment) · **Medium** (abuse, information leakage, integrity) · **Low** (hardening).

---

## 1. Authentication model (as found)

| Aspect | Implementation | Assessment |
|---|---|---|
| Session | Custom cookie `era_session` = `base64url(JSON{userId, role, name, exp}).HMAC-SHA256` (`src/lib/auth.ts`) | Sound construction; constant-time signature compare; 7-day expiry. |
| Cookie flags | `httpOnly`, `sameSite=lax`, `secure` in production, `path=/` | Good. `lax` blocks cross-site POSTs carrying the cookie (main CSRF defence). |
| Secret | `AUTH_SECRET`; production throws if missing; dev falls back to a constant | Acceptable; dev fallback must never reach production (enforced by the throw). |
| Re-validation | `getCurrentUser()` re-reads the user and requires `status = ACTIVE` | Good: role changes and suspensions take effect immediately. The cookie's `role` is never trusted for authorization. |
| Session revocation | None (stateless token) | Logout clears only the browser cookie. A stolen token stays valid until `exp` unless the user is suspended. Documented as remaining risk. |
| Deleted user with live cookie | `getCurrentUser()` calls `clearUserSession()` — **throws inside Server Components** ("Cookies can only be modified in a Server Action or Route Handler") | **Medium** — a deleted/suspended user hitting any page gets an error page instead of a clean sign-out. |
| Password hashing | bcrypt cost 12 | Good. |
| Sign-in rate limit | In-memory, 5 per 10 min per IP+identifier | Works per process only (see §5). |

## 2. Inventory of protected pages

| Route | Auth | Role | Ownership / enrollment | Sensitive data | Current implementation | Required correction |
|---|---|---|---|---|---|---|
| `/learn/**` | Yes | any signed-in | per record via `resolveCourseAccess` | lesson content, progress | `learn/layout.tsx` → `requireSignedIn`; pages call `getStudentCourse` / `getClassroom` | OK. Classroom sends raw `material.fileUrl` and `lesson.videoUrl` to the browser — must use authorized, short-lived URLs (F-09). |
| `/teacher/**` | Yes | INSTRUCTOR, ADMIN | instructor profile (fail-closed `getTeacherInstructorId`) | own students' names/progress | `teacher/layout.tsx` → `requireTeacher` | OK. |
| `/admin` (layout) | Yes | ADMIN, INSTRUCTOR | — | — | `admin/layout.tsx` → `canAccessAdminStudio` | OK as the outer gate; each page must still decide. |
| `/admin` overview, users, subjects, categories, instructors, analytics, assistant | Yes | ADMIN | — | all users, emails | `requireAdmin` per page | OK. |
| `/admin/courses`, `/lessons`, `/materials`, `/progress` | Yes | ADMIN, INSTRUCTOR | instructor's own courses | course drafts, student emails (progress) | layout only; data from `src/server/admin.ts` | **High (F-03)** — queries are *fail-open*: an INSTRUCTOR without a linked profile gets `where: undefined` = **every** course, lesson, material and every student's progress + email. |
| `/admin/settings` | Yes | ADMIN, INSTRUCTOR | own account | site settings | page reads settings; `saveSettingsAction` is admin-only | OK (instructors see read-only platform settings + own account form). |
| `/courses/[c]/lessons/[l]` (legacy public lesson page) | **No** | — | — | **full lesson: video URL, notes, materials, quiz, practice, ERA chat** | Public page renders `getLessonBySlugs` output for anyone; `generateMetadata` leaks the description | **High (F-02)** — paid/enrolled content readable without an account. Replace with a redirect into the authorized classroom. |
| `/my-learning`, `/sign-in`, etc. | as designed | — | — | — | — | OK. |

## 3. Inventory of API routes and server actions

| Endpoint | Auth | Role | Ownership / enrollment | Validation | Error handling | Finding |
|---|---|---|---|---|---|---|
| `POST /api/era/chat` | Yes | **any** | **none** (only "lesson + course published") | length ≤ 3000 | **returns `error.message`** with 503 (leaks e.g. `ERA_MODEL_NAME is not configured`, provider errors) | **High (F-04)**: any signed-in user (incl. not-enrolled students) can use the tutor on any lesson and read its full content through the answers. **Medium (F-11)**: error leakage. Timestamp is composed on the client into the question. |
| `GET /api/era/history` | Yes | any | user-scoped (`userId = current`) | `lesson_id` required | generic | **Low**: no lesson-access check (only own messages leak, but access after un-enrollment persists). Conversation ownership is enforced by the `userId` filter — no cross-user read. |
| `GET /api/lesson/[id]/context` | **No** | — | — | — | generic | **High (F-05)**: unauthenticated read of full lesson content, objectives, key points and video URL for any published lesson ID. |
| `GET/POST /api/courses/[slug]/progress` | POST yes | STUDENT | **POST upserts an enrollment** | `lessonId` checked against course; **`currentLessonId` not checked** | generic | **High (F-06)**: implicit enrollment — any student can enroll themselves into any published course by posting progress; `currentLessonId` can point to a lesson of another course. **Medium**: multi-step writes outside a transaction. |
| `GET/POST /api/courses/[slug]/enroll` | POST yes | STUDENT | self | published course only | generic | OK by product decision (self-enrolment into published courses is the current business model, IA §OD-3). |
| `POST /api/courses/[slug]/view` | **No** | — | — | — | swallowed | **Medium (F-12)**: unauthenticated counter + `revalidatePath("/")` on every call → cache-busting / write amplification; inflatable view counts. |
| `GET/POST /api/courses/[slug]/reviews` | POST yes | **any** | **none** | rating 1–5, comment ≥ 8, **no max length** | generic | **Medium (F-13)**: any signed-in user (teachers, admins, never-enrolled students) can review any course, including drafts by slug; unbounded comment size. |
| `POST /api/practice/[id]/submit` | Yes | any | **none** | code length, language, result shape | **returns `error.message`** | **High (F-07)**: submissions to exercises of courses the user is not enrolled in; response includes **`solutionCode`** and solution notes → reveals solutions of any lesson. |
| `POST /api/practice/compile` | Yes | any | — | length, language; 30/min | generic | OK (pure text transform, nothing executed on the server). |
| `POST /api/onboarding/{draft,complete}` | Yes | STUDENT | self | per-field | generic | OK. |
| `POST /api/locale` | No | — | — | locale allow-list | — | OK. |
| `POST /api/admin/storage/upload` | Yes | ADMIN, INSTRUCTOR | user-scoped path | folder allow-list, size per folder, broad MIME list (`image/*` incl. **SVG**, `video/*`, archives), **`upsert: true`** | **returns provider message** | **Medium (F-10)**: SVG (script-capable) allowed; archives allowed for every folder; MIME not tied to folder/extension; overwrite allowed; returns a *public* URL for private course files; 401 used where 403 is correct. |
| `POST /api/admin/storage/delete` | Yes | ADMIN, INSTRUCTOR | instructors limited to own prefix | path | returns provider message | **Low**: path normalisation (`..`) not checked; error leakage. |
| Server action `create/update/deleteCourseAction`, `create/update/deleteLessonAction`, `create/update/deleteMaterialAction` | Yes | ADMIN, INSTRUCTOR | **`assertCourseManagementAccess` result is ignored** | basic | redirect codes | **CRITICAL (F-01)**: `assertCourseManagementAccess` *returns* `{allowed:false}` and never throws, but all 8 call sites wrap it in `try { await … } catch { redirect(forbidden) }`. **Any instructor can edit or delete any other teacher's course, lesson or material** (server actions are callable POST endpoints regardless of UI). |
| `update/deleteMaterialAction` storage cleanup | Yes | ADMIN, INSTRUCTOR | — | **client-supplied `storagePath` stored verbatim and later deleted with the service-role key** | — | **Critical (F-08)**: an instructor can save a material whose `storagePath` points at another user's object (or another course's video), then update/delete it — the server deletes that object. Also `fileUrl` accepts any URL (`javascript:` links in materials). |
| `createCourseAction` / `updateCourseAction` | Yes | ADMIN, INSTRUCTOR | — | — | — | **Medium (F-14)**: instructors can set `isFeatured` / `isPopular` (homepage merchandising is an admin decision). |
| `deleteUserAction` | Yes | ADMIN | — | — | — | **Medium (F-15)**: an admin can delete their own account or the last remaining admin (lock-out). |
| `createUserAction` | Yes | ADMIN | — | `status` free text | — | **Low**: `status` not validated against known values. |
| `updateAccountProfileAction` | Yes | any | self | — | — | **Low (F-16)**: instructor profile resolution `findFirst({OR:[userId, email]})` + **auto-link by email** means a user who changes their email to match an *unlinked* instructor profile can be linked to it; the resolution order is not deterministic when two profiles match. |
| `getAdminDashboardData` (legacy, unused) | — | — | — | — | — | **Low**: instructor branch returns all users' recent activity. |
| `getAdminUsers` (legacy, unused) | — | — | — | — | — | **Low**: returns full user rows incl. `passwordHash` if ever rendered. |

## 4. Threat model

| # | Threat | Where it applied (before) | Likelihood × impact | Mitigation required |
|---|---|---|---|---|
| T1 | **Unauthorized course access** (content without enrollment) | Legacy lesson page (F-02), lesson context API (F-05), tutor chat (F-04), practice submit (F-07), raw public storage URLs (F-09) | High × High | One server-side lesson-access resolver used by every surface; legacy page redirects; private files only via short-lived signed URLs. |
| T2 | **Horizontal privilege escalation** (teacher ↔ teacher, student ↔ student) | Studio actions (F-01), fail-open studio queries (F-03), storage path deletion (F-08) | High × Critical | Fail-closed ownership check that *blocks* (not returns); storage paths derived/validated server-side. |
| T3 | **Vertical escalation** (instructor → admin capabilities) | `isFeatured/isPopular` (F-14); profile auto-link by email (F-16) | Medium × Medium | Admin-only fields enforced in actions; deterministic profile resolution. |
| T4 | **IDOR** (guessing IDs) | `/api/lesson/[id]/context`, practice `exerciseId`, material `id`, chat `lessonId` | High × High | Every ID is re-authorized against the current user; non-authorized and non-existent are indistinguishable (404). |
| T5 | **Unauthorized file downloads** | Materials stored with public URLs in a public bucket; classroom links directly | High × High | Download route that authorizes then issues a signed URL (≤ 5 min); bucket switched to private (operational step). |
| T6 | **Student data exposure** | Fail-open progress query (emails of all students) | Medium × High | Scoped queries; minimal fields. |
| T7 | **Teacher isolation** | F-01, F-03, F-08 | High × Critical | As T2. |
| T8 | **Admin escalation / lock-out** | Self-delete / last-admin delete (F-15) | Low × High | Guard in action. |
| T9 | **API abuse** | Tutor (LLM cost), view counter, reviews, uploads | Medium × Medium | Per-user/IP rate limits on every write and LLM call; bounded inputs. In-memory limiter is per-instance (remaining risk). |
| T10 | **CSRF** | JSON route handlers | Low (SameSite=Lax) × High | Keep Lax; add same-origin check on state-changing route handlers; server actions already verify Origin (Next.js). |
| T11 | **Injection / validation** | Prisma parameterises queries (no raw SQL found: `grep $queryRaw` = 0). Missing bounds on review comments, chat timestamps, material URLs | Low × Medium | Central validators; URL scheme allow-list (`https:`/`http:` only). |
| T12 | **Information leakage via errors and logs** | Chat 503 message, practice submit message, upload/delete provider messages | Medium × Low–Medium | Fixed generic client messages; details only in server logs, never secrets. |
| T13 | **Session issues** | Deleted user cookie crash; no revocation | Low × Low | Safe clear; document revocation as a follow-up. |

## 5. Cross-cutting observations

- **Deny-by-default is not consistent.** Several routes check "signed in" and stop there. Authorization logic is duplicated in at least five places (`workspace.ts`, `student.ts`, `permissions.ts`, `admin.ts`, `actions.ts`) with different semantics (one fails closed, three fail open).
- **Storage**: one bucket (`SUPABASE_STORAGE_VIDEOS_BUCKET`, default `course-videos`) holds thumbnails, promo videos, lesson videos and course materials, all addressed by `/object/public/…` URLs. Making it private would break thumbnails and promo videos on the public catalogue, so the fix must separate public marketing assets from private course assets.
- **Rate limiting** is an in-process `Map`. On a multi-instance deployment (Vercel) each instance has its own counters. Acceptable for the launch scale; a shared store (Upstash/Redis or a Postgres table) is the follow-up.
- **No raw SQL** (`$queryRaw`/`$executeRaw` not used) → SQL injection surface is Prisma only.
- **No secrets in client bundles**: `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`, LLM keys are read only in server modules; only `NEXT_PUBLIC_SUPABASE_URL` is public (a URL, not a secret).
- **Security headers**: none configured (`next.config.ts`). Add `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`/`frame-ancestors`, `Permissions-Policy` (low-risk additions).

## 6. Findings summary

| ID | Severity | Title |
|---|---|---|
| F-01 | **Critical** | Studio course/lesson/material actions ignore the ownership check result |
| F-08 | **Critical** | Client-controlled `storagePath` deleted with service-role key; arbitrary `fileUrl` |
| F-02 | High | Legacy public lesson page renders full lesson content without auth |
| F-03 | High | Fail-open studio queries for instructors without a profile |
| F-04 | High | Tutor chat without enrollment / role check |
| F-05 | High | Unauthenticated lesson context API |
| F-06 | High | Implicit enrollment and unchecked `currentLessonId` in progress API |
| F-07 | High | Practice submit without access check returns solutions |
| F-09 | High | Private course files and videos served via permanent public URLs |
| F-10 | Medium | Upload validation too broad (SVG, archives everywhere, overwrite) |
| F-11 | Medium | Error messages leak configuration/provider details |
| F-12 | Medium | Unauthenticated view counter triggers cache revalidation |
| F-13 | Medium | Reviews from non-enrolled users / unbounded comment |
| F-14 | Medium | Instructors can set homepage merchandising flags |
| F-15 | Medium | Admin can delete self / last admin |
| F-16 | Low | Non-deterministic instructor profile resolution + email auto-link |
| F-17 | Low | Deleted-user cookie crashes Server Components |
| F-18 | Low | No same-origin check on JSON route handlers; no security headers |
| F-19 | Low | Legacy unused helpers return over-broad data |
| F-20 | Low | JSON-LD `<script>` blocks not escaped (admin-editable text could close the script element) |
| F-21 | Low | Rate limiter with `maxAttempts: 1` allowed two attempts (found by the test suite) |
| F-22 | Medium (availability) | Signed-in rate limits keyed by IP as well as user: a classroom behind one school IP shares one tutor budget |

All findings are resolved; see `docs/ERA_SECURITY_IMPLEMENTATION.md`. The remaining risks are listed in the Prompt 07 final report and `docs/ERA_SECURITY_TEST_REPORT.md` §5.
