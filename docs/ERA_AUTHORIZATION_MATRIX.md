# ERA Academy — Authorization Matrix (Prompt 07)

The single source of truth for "who may do what". Every rule below is enforced **on the server** by
`src/server/authz.ts` (APIs, loaders, server actions) or by the page guards in `src/server/workspace.ts`
(which reuse the same core). Navigation visibility is never the control.

**Legend:** ✅ allowed · ❌ denied · 👁 read-only preview · — not applicable
**Roles:** Anon (signed out) · Student · Teacher (INSTRUCTOR *with* a linked instructor profile) ·
Teacher⁰ (INSTRUCTOR *without* a profile — owns nothing) · Admin.
"Own course" = `Course.instructorId` equals the teacher's profile id. "Enrolled" = an `Enrollment` row exists
for (user, course) **and** the course is `PUBLISHED`.

## 1. Principles

1. **Deny by default.** A helper returns the authorized record or throws `AuthzError` (401/403/404).
2. **Identity from the session only.** `getCurrentUser()` verifies the HMAC cookie, re-reads the user and
   requires `status = ACTIVE`. The cookie's `role` is never used for decisions. Request bodies never supply
   `userId`, `teacherId` or `organizationId`; such fields are ignored.
3. **Fail closed for teachers.** No linked instructor profile ⇒ studio scope `none` ⇒ empty lists and 403 on writes.
4. **Indistinguishable denial.** Someone else's course/lesson/material and a non-existent one both return 404
   (the record's existence is private). "Not enrolled" in a *published* course returns 403 `not-enrolled`
   because the course is public in the catalogue and the UI needs to offer enrolment.
5. **Students need published content.** Draft/archived courses and lessons are 404 for students; owner
   teachers see drafts in *Teacher Preview*; admins see everything in *Admin Inspection*.
6. **Enrollment is created in one place only** — `POST /api/courses/[slug]/enroll` (self-enrolment into a
   published course). No other endpoint creates enrollments.

## 2. Pages

| Route | Anon | Student | Teacher | Teacher⁰ | Admin |
|---|---|---|---|---|---|
| `/learn`, `/learn/courses` | → sign-in (307, deep link kept) | ✅ own data | ✅ own data | ✅ own data | ✅ own data |
| `/learn/courses/[c]` , `/learn/courses/[c]/lessons/[l]` | → sign-in | ✅ if enrolled; else enrol prompt; drafts 404 | 👁 own courses (preview); others 404 | 404 | 👁 inspection |
| `/courses/[c]/lessons/[l]` (legacy) | → `/learn/…` → sign-in | → `/learn/…` | → `/learn/…` | → `/learn/…` | → `/learn/…` |
| `/teacher/**` | → sign-in | → `/learn` | ✅ own scope | ✅ empty scope | ✅ only via linked profile |
| `/admin` (overview), `/admin/users`, `/subjects`, `/categories`, `/instructors`, `/analytics`, `/assistant` | → sign-in | ❌ | ❌ (→ `/teacher`) | ❌ | ✅ |
| `/admin/courses`, `/lessons`, `/materials`, `/progress` | → sign-in | ❌ | ✅ own courses only | ✅ empty | ✅ all |
| `/admin/settings` | → sign-in | ❌ | own account ✅, platform settings 👁 | same | ✅ |

## 3. API route handlers

| Endpoint | Anon | Student | Teacher | Admin | Validation / limits |
|---|---|---|---|---|---|
| `POST /api/era/chat` | 401 | ✅ enrolled + published lesson; else 403/404 | 403 | 403 | `lessonId` id; optional `courseId` must match; `question` 1–3000; optional `timestampSeconds` int 0–86400; 16 KB body; 8/min per user; same-origin |
| `GET /api/era/history` | 401 | ✅ own messages, lesson access re-checked | 403 | 403 | `lesson_id` id |
| `GET /api/lesson/[id]/context` | 401 | ✅ enrolled + published | ✅ own course (drafts) | ✅ | id; video URL signed |
| `GET /api/materials/[id]/download` | 401 | ✅ enrolled (lesson or course material) | ✅ own course | ✅ | id; 120/10 min per user; 302 → signed URL (5 min), `no-store` |
| `GET /api/courses/[slug]/progress` | ok (`canTrack:false`) | own data; `canTrack` only if enrolled | `canTrack:false` | `canTrack:false` | — |
| `POST /api/courses/[slug]/progress` | 401 | ✅ **existing enrollment required**; lesson ids must be published lessons of this course | 403 | 403 | ids; `completed` boolean; 4 KB; transaction; same-origin |
| `GET/POST /api/courses/[slug]/enroll` | 401 (POST) | ✅ self, published course | 403 | 403 | — |
| `POST /api/courses/[slug]/reviews` | 401 | ✅ enrolled only | 403 | 403 | rating 1–5; comment 8–2000; same-origin |
| `POST /api/courses/[slug]/view` | ✅ (anonymous counter) | ✅ | ✅ | ✅ | 1 per client+course per 30 min; no cache revalidation |
| `POST /api/practice/[id]/submit` | 401 | ✅ enrolled + published lesson | ✅ own course | ✅ | id; code ≤ 20 000; language allow-list; result shape; 30/min per user |
| `POST /api/practice/compile` | 401 | ✅ | ✅ | ✅ | text-only transform; 30/min |
| `POST /api/onboarding/*` | 401 | ✅ self | 403 | 403 | per field |
| `POST /api/admin/storage/upload` | 401 | 403 | ✅ path under own prefix | ✅ path under own prefix | folder allow-list; extension+MIME allow-list per folder; size per folder; no SVG/HTML/executables; `x-upsert:false`; 60/h |
| `POST /api/admin/storage/delete` | 401 | 403 | ✅ own prefix only | ✅ any server-generated path | path syntax (no traversal) |

## 4. Server actions (`src/app/admin/actions.ts`)

| Action | Student | Teacher | Teacher⁰ | Admin | Extra rules |
|---|---|---|---|---|---|
| create course | ❌ | ✅ assigned to self | ❌ (`missing-instructor-profile`) | ✅ any instructor | `isFeatured/isPopular` admin-only; URLs http(s) |
| update / delete course | ❌ | ✅ own only | ❌ | ✅ | instructor cannot reassign to another teacher; flags untouched |
| create / update / delete lesson | ❌ | ✅ own course (both source and target course on move) | ❌ | ✅ | video URL http(s) |
| create / update / delete material | ❌ | ✅ own course; lesson must belong to course | ❌ | ✅ | `fileUrl` http(s); storage path **derived on the server** from the URL and must be the teacher's own upload in a material folder; stored file deleted only if unreferenced and owned |
| subjects, categories, instructors, users, platform settings | ❌ | ❌ | ❌ | ✅ | delete user: not self, not the last admin; status allow-list |
| update own account / change password | ✅ self | ✅ self | ✅ self | ✅ self | current password required |

## 5. Data minimisation

| Surface | Fields that never leave the server |
|---|---|
| Classroom (`getClassroom`) | quiz answers, practice `solutionCode`, material `fileUrl`/`storagePath` (replaced by `/api/materials/[id]/download`), raw storage video URL (replaced by a signed URL) |
| Practice submit | solution returned **only** after lesson access is confirmed |
| User lists (`getAdminUserList`, legacy `getAdminUsers`) | `passwordHash` |
| Teacher workspace | other teachers' students; student emails are not selected |
| Errors | provider/storage messages, stack traces, configuration names (logged server-side only) |

## 6. Helper reference (`src/server/authz.ts`)

| Helper | Use it when |
|---|---|
| `requireAuthenticatedUser()` | any signed-in action |
| `requireAdminUser()` / `requireTeacherUser()` / `requireStudentUser()` | role gates for route handlers |
| `getStudioScope(user)` + `studioCourseWhere(scope)` | listing studio data (null ⇒ return nothing) |
| `requireTeacherCourseOwnership(user, courseId)` | any studio write on a course or its children |
| `resolveCourseAccess(user, course, enrolled?)` | page loaders that render an access-specific screen |
| `requireCourseAccess(user, courseId)` | learner access to a course-level resource |
| `requireLessonAccess(user, lessonId, { courseId?, studentsOnly? })` | learner access to a lesson-level resource (one query) |
| `requireStudentEnrollment(user, courseId)` | student writes (progress, reviews) |
| `assertSameOrigin(request)` | every state-changing JSON route handler |
| `toApiErrorResponse(error, fallback)` | every route handler `catch` |


## Student Management & Payments (added)

Full matrix: `docs/ERA_STUDENT_MANAGEMENT.md` §7. Summary:

- **Admins:** all students, enrollments, payments, exams and teacher permissions.
- **Teachers:** only the enrollments assigned to them (`Enrollment.instructorId`). By default they can add notes and schedule exams. Seeing, recording or approving payments, creating enrollments, changing dates and changing access each need a permission granted by an admin (`instructor_permissions`).
- **Students:** their own enrollments, payment status and transactions, read-only. They never see notes, approvers or other students.
- **Course access** now also requires an enrollment whose access is active (status, access status, expiry, optional overdue rule), checked in `authz.ts`.
- **Row Level Security** is enabled, with no policies, on every table (migration `3_row_level_security`), which blocks Supabase's public Data API.
