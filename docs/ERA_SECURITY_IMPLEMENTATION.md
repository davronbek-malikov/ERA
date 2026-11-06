# ERA Academy — Security Implementation (Prompt 07)

What changed, why, and how to operate it. Findings (F-xx) refer to `docs/ERA_SECURITY_AUDIT.md`;
rules are listed in `docs/ERA_AUTHORIZATION_MATRIX.md`; evidence is in `docs/ERA_SECURITY_TEST_REPORT.md`.

No database schema change and no migration were needed. `.env` was not modified.

---

## 1. Centralised authorization (Task 2)

**New:** `src/server/authz.ts`. It is the only place that decides access to courses, lessons, materials,
conversations and studio data.

| Helper | Behaviour |
|---|---|
| `requireAuthenticatedUser` | 401 when there is no valid, active session |
| `requireAdminUser` / `requireTeacherUser` / `requireStudentUser` | 403 for the wrong role |
| `getInstructorIdForUser` | INSTRUCTOR → own profile; ADMIN → explicitly linked profile only; otherwise `null` |
| `getStudioScope` / `studioCourseWhere` | `admin` / `instructor(id)` / `none`; `none` ⇒ `null` filter ⇒ callers return `[]` |
| `requireTeacherCourseOwnership` | admin: any existing course; instructor: own only (404 otherwise); no profile: 403 |
| `resolveCourseAccess` | moved from `src/server/student.ts` (same semantics, now shared) |
| `requireCourseAccess` / `requireLessonAccess` | one query each (lesson → course → this user's enrollment); optional `courseId` must match; `studentsOnly` |
| `requireStudentEnrollment` | existing enrollment in a published course; never creates one |
| `assertSameOrigin` | rejects state-changing requests whose `Origin` differs from the host |
| `toApiErrorResponse` | known errors keep status and fixed message; unknown errors are logged (name and message) and the caller's generic message is returned |

**Supporting changes**
- `src/lib/validation.ts` (new) provides `RequestError`, `readJsonObject` (size cap; JSON objects only),
  `requireId`/`optionalId`, `requireString`, `optionalInteger`, `optionalBoolean` and `isSafeHttpUrl`. It has no
  dependencies.
- `src/lib/permissions.ts` changes how an instructor profile is resolved: first the profile linked by `userId`,
  then an *unclaimed* profile with the same email (case-insensitive), which is claimed with a conditional
  update. A profile linked to another user is never returned (F-16). The broken `assertCourseManagementAccess`
  was removed (F-01).
- `src/server/workspace.ts`: `getTeacherInstructorId` now delegates to `authz`, removing a duplicated
  implementation.
- `src/server/student.ts` uses the shared `resolveCourseAccess`.
- `src/lib/rate-limit.ts` adds `getUserRateLimitKeyParts(userId)`. Signed-in endpoints are limited per account
  rather than per IP, because students in one classroom share a school IP and would otherwise use up each other's
  tutor budget.

## 2. Legacy lesson route (Task 3, F-02)

- `next.config.ts` now has a redirect: `/courses/:c/lessons/:l` → `/learn/courses/:c/lessons/:l` (307). It runs
  before any rendering.
- `src/app/(public)/courses/[courseSlug]/lessons/[lessonSlug]/page.tsx` was replaced by a fallback redirect
  with generic, `noindex` metadata. It no longer loads lesson data.
- **New:** `src/middleware.ts`. On `/learn`, `/teacher` and `/admin`, a request with no session cookie gets a
  307 to `/sign-in?next=<deep link>`. The middleware only checks that the cookie is present; it does not verify
  it. Every layout, page and handler still verifies the session.
- Result by role:
  - **Anonymous:** sent to sign-in, then returns to the lesson.
  - **Enrolled student:** the classroom.
  - **Not-enrolled student:** an enrol prompt with no content.
  - **Owner teacher:** preview.
  - **Admin:** inspection.
  - **Other teacher:** 404.
- The components used only by the old page (`lesson-study-shell`, `lesson-chat`, `lesson-sidebar`) are now
  unused but were kept, so no working code was deleted. Removing them is a cleanup for later.

## 3. Tutor chat, history and context (Task 4, F-04, F-05, F-11)

`/api/era/chat`
- Same-origin check, then student role, then `requireLessonAccess(…, { courseId, studentsOnly: true })`. This
  enforces enrollment, a published course and lesson, and the course–lesson relationship.
- Validation:

  | Field | Rule |
  |---|---|
  | `lessonId` | ID format |
  | `courseId` | optional; must match the lesson's course |
  | `question` | 1–3000 characters |
  | `timestampSeconds` | optional integer, 0–86400 |
  | body | at most 16 KB |

- The timestamp is now a separate field. The note "(Asked at m:ss …)" is composed on the server.
  `src/lib/era/tutor-client.ts` sends the field, and `formatClock` moved to `src/lib/format.ts`.
- Access is checked before the rate limit, so denied requests don't use up the user's budget. Then the limit
  applies: 8 per minute per user.
- Errors return a fixed message. Provider and configuration details are only logged on the server.
- The tutor engine, provider and prompt are unchanged. No new LLM provider was added.

`/api/era/history` is for students only, re-checks lesson access, and stays scoped to the session user.
Conversation ownership is the `userId` taken from the session, never from the request.

`/api/lesson/[id]/context` now requires authentication and lesson access. Its video URL is signed.

## 4. Private storage (Task 5, F-08, F-09, F-10)

**Bucket model.** The new `src/lib/storage.ts` policy sends each upload folder to one of two buckets:

| Folder | Visibility | Bucket env | Allowed types | Max |
|---|---|---|---|---|
| `course-thumbnails`, `subject-thumbnails`, `images` | public | `SUPABASE_STORAGE_PUBLIC_BUCKET` (falls back to the private bucket) | jpg, jpeg, png, webp, gif, avif (no SVG) | 10 MB |
| `course-promo-videos` | public | same | mp4, m4v, webm, mov, ogv | 500 MB |
| `lesson-videos` | **private** | `SUPABASE_STORAGE_VIDEOS_BUCKET` (default `course-videos`) | mp4, m4v, webm, mov, ogv | 500 MB |
| `lesson-materials`, `course-materials` | **private** | same | pdf, doc(x), ppt(x), xls(x), csv, txt, zip, rar, 7z | 25 MB |

- The extension *and* the declared MIME type must both match the allow-list for the folder. Anything not listed
  is rejected: executables, scripts, HTML, SVG, and double extensions like `x.pdf.exe`.
- Uploads (`/api/admin/storage/upload`):
  - the server generates the path `users/<uploader>/<folder>/<YYYY-MM>/<uuid>-<name>.<ext>`
  - existing objects are never overwritten (`x-upsert: false`)
  - limited to 60 per hour per user
  - errors are generic
  - students get 403 (was 401)
- Delete (`/api/admin/storage/delete`): path syntax is validated (no traversal, server-generated paths only).
  Instructors can delete only their own prefix; admins any upload path. The bucket is derived from the folder.
- **Download** (`/api/materials/[id]/download`, new):
  1. authenticate, then authorize lesson or course access;
  2. redirect (302) to a signed URL that is valid for **5 minutes**, with `Cache-Control: private, no-store`
     and `Referrer-Policy: no-referrer`;
  3. external http(s) links are passed through after the same check.
- Classroom (`getClassroom`): materials are sent as `{id, title, mimeType, href}` pointing at the download
  route. `fileUrl` and `storagePath` never reach the browser. The lesson video is signed for **4 hours** at
  render time if it is in the private bucket. External URLs (YouTube/Vimeo) are unchanged. If signing fails,
  the video is withheld rather than exposed.
- Material server actions (F-08):
  - `fileUrl` must be http(s)
  - `storagePath` is **derived on the server** from `fileUrl`; the client's hidden field is ignored
  - instructors can attach only their own uploads in a material folder; keeping the file already attached is
    always allowed
  - stored files are deleted only when they are owned by the actor (or the actor is an admin), are in a material
    folder, and no material still references them
  - delete failures are logged, not shown

**Migration strategy (operational, no data-format change).** URLs keep their historical
`/object/public/<bucket>/<path>` format and serve as stable references.
1. Create a **public** bucket (for example `public-assets`) and set `SUPABASE_STORAGE_PUBLIC_BUCKET=public-assets`.
   New thumbnails and promo videos go there.
2. Move any existing objects under `*/course-thumbnails/`, `*/subject-thumbnails/`, `*/images/` and
   `*/course-promo-videos/` into the public bucket, then update `Course.thumbnailUrl`, `Course.promoVideoUrl` and
   `Subject` image URLs. Skip this step if the project starts with empty storage, as the current one does: its
   Supabase project is new.
3. In Supabase, switch `course-videos` to **private**. Direct `/object/public/...` links to lesson videos and
   materials stop working. The app already serves them only through signed URLs.
4. To roll back, make the bucket public again. No code change is needed.

Until step 3 is done, the private bucket is still technically public. Signed URLs work either way. The step is
listed as a remaining risk until it is completed in the Supabase dashboard.

## 5. Progress and enrollment (Task 6, F-06, F-12, F-13)

`POST /api/courses/[slug]/progress`:
- same-origin check, then student role, then an **existing enrollment** (no more upsert-created enrollments)
- `lessonId` and `currentLessonId` must be **published lessons of this course**
- `completed` must be a boolean, and is accepted only together with `lessonId`; body at most 4 KB
- the completion and the resume position are written in **one interactive transaction**
- activity tracking and the progress, gamification and learning-path sync run afterwards, unchanged

`GET` reports `canTrack: true` only for enrolled students.

Other endpoints:
- **Practice submit:** lesson access is required before anything is recorded or a solution is returned.
  Errors are fixed messages; 30 submissions per minute per user.
- **Reviews:** enrolled students only; comment 8–2000 characters; same-origin.
- **View counter:** de-duplicated to one view per client and course per 30 minutes; it no longer calls
  `revalidatePath("/")`.

## 6. Teacher and admin isolation (Task 7, F-01, F-03, F-14, F-15, F-19)

- **Server actions** (`src/app/admin/actions.ts`): every course, lesson and material write now calls
  `requireManagedCourse()`, which wraps `requireTeacherCourseOwnership`. It **blocks** with `?error=forbidden`.
  Before, all 8 call sites ignored the result of the old check. Moving a lesson or material checks both the
  source and the target course.
- **Merchandising:** `isFeatured` and `isPopular` are admin-only. An instructor's update leaves them unchanged.
- URL fields (thumbnail, promo video, lesson video, material, user image) must be http(s).
- `deleteUserAction`: an admin can't delete their own account or the last admin. `createUserAction` validates
  `status` against an allow-list.
- **Studio loaders** (`src/server/admin.ts`) are scoped by `getStudioScope` and **fail closed**. An instructor
  without a profile gets empty lists. The legacy `getAdminDashboardData` and `getAdminUsers` are admin-only and
  no longer return full user rows or password hashes. Instructor choices in the form options are restricted to
  the teacher themselves.
- **Editors reviewed:**
  - courses, lessons and materials: owner or admin
  - subjects, categories, teacher profiles, users and platform settings: admin-only, and each action re-checks
    (`requireAdminUser`)
  - account and password: self only
- Pages that are admin-only already called `requireAdmin`. Shared editor pages rely on the scoped loaders above.

## 7. Cross-cutting hardening (F-17, F-18, F-20)

- `getCurrentUser()` no longer throws in Server Components when it tries to clear the cookie of a deleted or
  suspended user.
- Security headers on all responses: `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, and a restrictive
  `Permissions-Policy`.
- JSON-LD blocks are serialized with `src/lib/json-ld.ts`, which escapes `<`, `>` and `&` so that text an admin
  can edit can't break out of the script element.

## 8. Organization-ready architecture (Task 8, analysis only)

No organization model was added, as the prompt asked. The current design is ready for one:

- **Tenancy seam.** Every authorization decision already goes through `authz.ts` and every studio query through
  `studioCourseWhere(scope)`. Adding `organizationId` to `Course` (and to `Instructor` and `User` membership)
  means extending `StudioScope` with `{ kind: "org-admin", organizationId }` and adding an `organizationId`
  predicate in `studioCourseWhere` and `resolveCourseAccess`. Call sites don't change.
- **Recommended model (future migration, additive only):**
  - `Organization(id, name, slug, plan)`
  - `Membership(userId, organizationId, role: OWNER|ADMIN|TEACHER|STUDENT)`
  - nullable `Course.organizationId`, back-filled to a default "ERA Academy" organization
  - make it required only after the back-fill
  - no destructive steps
- **Rules to keep:** an organization ID never comes from the client; it is derived from the membership of the
  session user and the record being accessed. Platform admins stay global; organization admins are scoped.
- **Storage:** add an organization segment, `orgs/<orgId>/users/<userId>/…`. `isSafeStoragePath` and the
  prefix checks are the only places that need to learn about it.
- **Rate limits and AI cost:** keys can become `org:<id>` for per-organization quotas.
- **When to do it:** when a second school or teacher group needs administrative separation. It isn't needed
  for the single-teacher launch.

## 9. Test infrastructure (Task 9)

The suite uses Node's built-in test runner (`node --test`) plus the existing `tsx`. **No new dependencies.**
- `npm run test:security` runs `tests/security/run.mjs`:
  1. It refuses to start unless `ERA_TEST_DATABASE_URL` (default `localhost:51218`) is local.
  2. It syncs the schema without destroying data (`prisma db push`, no reset).
  3. It creates fixtures. The fixture script refuses to clear any database that holds a non-`@security.test`
     account.
  4. It starts fake Supabase Storage and fake Ollama servers in-process.
  5. It builds into `.next-test` (`NEXT_DIST_DIR`), so the dev server's `.next` is untouched.
  6. It runs `next start` on port 3950 with test-only secrets, then both suites.
- One-time setup: `npx prisma dev -n era-test -d`. Point `ERA_TEST_DATABASE_URL` at the URL it prints if that
  differs from the default.
- `.next-test` and `tests/security/.state/` are git-ignored.
