# ERA Academy: Product and Technical Audit

**Date:** 5 November 2026
**Scope:** the whole codebase on branch `phase-1-foundation`, assessed against the new AI-first product vision (Teacher, Student and Admin workspaces, each with an isolated AI assistant).
**Status of this document:** an assessment only. Writing it changed no code, schema, auth or dependencies.

---

## 0. How this audit was done, and its limits

| Method | Used for |
|---|---|
| Reading every route, server module, API handler, the Prisma schema and the key components | All findings unless marked otherwise |
| `tsc --noEmit` (passes) and `next lint` (passes) | Code health |
| Running the dev server | Page rendering and error behaviour |
| Scripted tests of the practice compiler and browser runner | Practice lab (9/9 checks pass) |

**Limit:** the production database is unreachable. The old Supabase project returns `tenant/user ... not found`. So **no flow that needs data was tested at runtime**: sign-in, enrollment, progress, AI chat, uploads and admin CRUD. Findings about those flows come from reading the code, and each is labelled **(code-verified)**. Nothing is reported as broken unless the code path shows it.

**Working-tree note:** practice-lab hardening (browser execution, no solutions sent to the client) is complete but **uncommitted** on this branch. This audit describes the code as it is on disk.

---

## 1. Executive summary

ERA is a well-structured **Next.js 15 / Prisma / PostgreSQL** learning platform. It has a polished bilingual (English and Uzbek) public site, a course catalog, lesson pages with a per-lesson AI tutor, and a shared admin and instructor studio. The code is typed, consistent and reasonably modular.

Against the new vision, these are the main points:

1. **The base is reusable.** The design system, data model (Subject → Category → Course → Module → Lesson), auth primitives, AI provider abstraction and admin CRUD patterns can all carry the new product. A rewrite isn't needed.
2. **Authorization is the main gap.** Permission checks are spread across individual handlers, with no central policy layer. As a result:
   - lesson content is **public**, not enrollment-gated
   - **instructors can see all users' personal data** and all platform activity
   - the AI tutor answers for **any lesson to any signed-in user**

   The isolation required for three workspaces with separate AI assistants must be built before any assistant features.
3. **"Workspaces" don't exist yet.** Today the student experience is spread across the public site (`/my-learning` and the lesson pages), and teachers and admins share one `/admin` studio separated only by partial filters.
4. **The AI layer is a single-purpose lesson chat.** It has no conversation, assistant-scope, document or memory entities. Every multi-assistant feature in the vision needs **schema additions**. That is deliberately out of scope here and is planned for a later phase (section 9).
5. **The video tutor's foundations are partly there.** The lesson page already places the video, notes and AI chat together, but it has no playback-time awareness, transcripts or side-by-side layout.

---

## 2. Current architecture

### 2.1 Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 15.5 App Router, React 19, TypeScript 5 | Server Components plus Server Actions plus Route Handlers |
| Styling | Tailwind 3, CSS variables, shadcn-style primitives | Documented in `docs/design-system.md` |
| Database | PostgreSQL through Prisma 6 | Hosted on Supabase (currently offline) |
| File storage | Supabase Storage | Signed upload URLs, **public** read URLs |
| Auth | Custom HMAC-SHA256 signed cookie (`era_session`), bcrypt cost 12 | No third-party auth library |
| AI | `src/lib/era/provider.ts`: Ollama or OpenAI-compatible | Non-streaming, per-lesson context |
| i18n | Cookie-based `en`/`uz`, inline copy objects plus `src/lib/i18n.ts` | Copy is mostly inline in components |
| Email | Nodemailer (`src/lib/mailer.ts`) | Used for password reset |
| Deploy target | Vercel | `.vercel/project.json` present |

### 2.2 Code layout

```
src/
  app/
    (public)/        public site plus student pages (shared layout: navbar, drawer, footer)
    admin/           studio for ADMIN and INSTRUCTOR (own layout and shell)
    api/             route handlers (JSON, { data } / { error } envelope)
  components/        ui/ primitives, layout/, marketing/, courses/, admin/, era/, onboarding/ ...
  lib/               auth, permissions, storage, rate-limit, i18n, prisma, errors, formatting
  server/            server-only data functions (courses, lessons, admin, practice, analytics ...)
prisma/              schema.prisma, seed.ts
scripts/             ensure-* content seeding scripts
```

**Pattern:** pages are Server Components that call `src/server/*` functions directly. Mutations go through Server Actions (`src/app/admin/actions.ts`, auth actions) or Route Handlers (`src/app/api/*`). Errors are mapped by `src/lib/app-errors.ts`. Transient database failures are retried by `retryOnDatabaseFailure`.

### 2.3 Data model (27 models)

```
Subject 1─* Category 1─* Course 1─* CourseModule 1─* Lesson
                          │                          ├─1 LessonContent (notes, objectives, key points, practice prompt)
                          │                          ├─* LessonQuizQuestion
                          │                          ├─* LessonSubskill
                          │                          ├─* PracticeExercise 1─* PracticeSubmission
                          │                          ├─* CourseMaterial
                          │                          └─* ChatMessage (userId, courseId, lessonId, role, content)
                          ├─* Enrollment (progress, currentLessonId)
                          ├─* CourseReview, CourseViewEvent
                          └─* PathCourse *─1 LearningPath 1─* UserPathProgress
Instructor ─(optional 1:1)─ User
User ── Enrollment, LessonCompletion, ChatMessage, ActivityLog, PasswordResetCode,
        UserOnboarding, UserXp, Streak, Badge, PracticeSubmission, CourseReview
SiteSetting (singleton)
```

Roles: `UserRole { STUDENT, INSTRUCTOR, ADMIN }`. Note that `User.status` is a free-form `String` (`"ACTIVE"`), not an enum.

---

## 3. Routes and pages

### 3.1 Public and student pages (`src/app/(public)/`)

| Route | Purpose | Access |
|---|---|---|
| `/` | Marketing homepage: hero, personalised course rows, subjects, instructor proof, FAQ | Public; personalised when signed in |
| `/about`, `/faq` | Static content (`src/lib/about`, `src/lib/faq`) | Public |
| `/subjects`, `/subjects/[subjectSlug]` | Subject catalog | Public |
| `/courses`, `/courses/[courseSlug]` | Course catalog with filters, course detail with curriculum, reviews, enroll button | Public |
| `/courses/[courseSlug]/lessons/[lessonSlug]` | **Lesson page**: video, notes, practice lab, quiz, AI tutor, materials | **Public. No auth or enrollment check** |
| `/learning-paths` | Multi-course paths with progress | Public; progress when signed in |
| `/onboarding` | Goal, level and assessment wizard | Signed in |
| `/my-learning` | **Student dashboard**: enrollments, XP and streak, analytics, onboarding checklist | Students; **redirects to `/onboarding` until it is completed** |
| `/sign-in`, `/sign-up`, `/forgot-password` | Auth (phone or email, reset code by email) | Public |

### 3.2 Studio (`src/app/admin/`)

The layout guard is `canAccessAdminStudio(role)`, which allows ADMIN **and** INSTRUCTOR. No page has its own role guard.

| Route | Purpose | Instructor scoping |
|---|---|---|
| `/admin` | Dashboard: counts and recent activity | Counts scoped. **Activity feed not scoped** |
| `/admin/subjects`, `/admin/categories` | Taxonomy CRUD | Mutations admin-only; lists visible to all |
| `/admin/courses`, `/admin/lessons`, `/admin/materials` | Content CRUD | Ownership enforced on mutations (`assertCourseManagementAccess`) |
| `/admin/instructors` | Instructor profiles | Mutations admin-only |
| `/admin/users` | User list plus create and delete | Mutations admin-only. **The list shows all users' name, email and phone to instructors** |
| `/admin/progress` | Enrollment progress | Scoped to the instructor's courses |
| `/admin/settings` | Site settings, own profile, password | Site settings admin-only |

### 3.3 API (`src/app/api/`)

| Endpoint | Auth | Notes |
|---|---|---|
| `GET/POST /api/courses/[slug]/enroll` | POST: student | Self-enrollment into any published course |
| `GET/POST /api/courses/[slug]/progress` | POST: student | Marks completion and resume point. **Upserts an enrollment implicitly** |
| `GET/POST /api/courses/[slug]/reviews` | POST: signed in | Course reviews |
| `POST /api/courses/[slug]/view` | **None** | Increments `viewCount` and calls `revalidatePath("/")` on every call |
| `POST /api/era/chat` | Signed in | AI tutor. Rate limited to 8 per minute per user/IP (in memory). **No enrollment check** |
| `GET /api/era/history` | Signed in | Scoped to the current user ✔ |
| `GET /api/lesson/[id]/context` | **None** | Returns full lesson notes, objectives and key points for any published lesson |
| `POST /api/onboarding/draft`, `/complete` | Signed in | Onboarding state |
| `POST /api/practice/compile` *(new, uncommitted)* | Signed in, 30 per minute | Transpiles only; never executes |
| `POST /api/practice/[id]/submit` | Signed in | Records browser-reported results |
| `POST /api/admin/storage/upload`, `/delete` | Admin or instructor | Signed upload URL. Instructors limited to their own path prefix on delete |
| `POST /api/locale` | None | Sets the locale cookie |

---

## 4. Current user workflows (from code)

**Student**
1. Sign up with name, email or phone and password. The role is always `STUDENT`.
2. On the first visit to `/my-learning`, the student is redirected to onboarding (goal, level, time, assessment), which produces a recommended course and plan.
3. Browse courses and **Add to My Learning**, which creates an `Enrollment` (self-service, free).
4. Open a lesson: watch the video (YouTube, Vimeo or a raw file URL), read notes, see the quiz questions (display only), run practice code, and ask ERA questions.
5. Mark the lesson complete by hand. This recalculates progress, XP, streak, badges and learning-path progress.

**Instructor**
1. An account is created by an admin (there's no self-signup as instructor). It is linked to an `Instructor` record by `userId` or **by matching email**.
2. In `/admin`, the instructor creates and edits **their own** courses, lessons and materials, and uploads files to Supabase.
3. They can view progress for their own courses. They can also view all users and all activity (see the risks in section 7).

**Admin**
1. Full CRUD on taxonomy, courses, lessons, materials, instructors, users and settings.
2. Can delete any stored file.

**Not possible today:**
- Editing modules, lesson notes, quizzes, subskills or practice exercises in the UI (they exist only in seed scripts).
- Assigning work to students.
- Grading.
- Teacher–student communication.

---

## 5. Inventory by area

### 5.1 Authentication and authorization
- **Session:** a payload of `{ userId, role, name, exp }`, signed with HMAC-SHA256, compared in constant time, valid for 7 days, `httpOnly` and `sameSite=lax`.
  - `getCurrentUser()` **re-reads the user from the database** and rejects non-`ACTIVE` accounts, so role changes and deactivation take effect immediately ✔.
  - The public layout uses the cookie-only `getSession()` for the header, so the displayed name and role can be up to 7 days stale. This only affects display, not security.
- **Passwords:** bcrypt cost 12. Reset uses hashed, expiring codes (`PasswordResetCode`). Sign-in and reset are rate-limited.
- **Authorization helpers:** `src/lib/permissions.ts` provides `canAccessAdminStudio`, `isAdmin`, `getInstructorRecordForUser` and `assertCourseManagementAccess`. Everything else is **inline checks in each handler**.
- There's **no `middleware.ts`**, so route protection is per layout or page.

### 5.2 Dashboards
- **Student** (`/my-learning`): enrollments with resume links, XP/level/streak/badges, study analytics (`src/server/analytics.ts`), and an onboarding checklist.
- **Studio** (`/admin`): stat grid plus an activity feed. Instructors get scoped counts.
- No teacher-specific view of "my students" exists beyond `/admin/progress`.

### 5.3 Course and lesson management
- Course fields: title, subtitle, slug, descriptions, thumbnail, promo video, difficulty, outcomes, featured/popular/priority, status (DRAFT, PUBLISHED, ARCHIVED), position.
- Lesson form: title, description, `videoUrl`, duration (a free-text string), position.
- **There's no UI for:** `CourseModule`, `LessonContent`, `LessonQuizQuestion`, `LessonSubskill`, `PracticeExercise`, or `LearningPath`. These are populated by `prisma/seed.ts` and `scripts/ensure-*.ts`.
- Lessons created in the UI are always `PUBLISHED`. Status can't be chosen when creating.

### 5.4 Video player
- In `lessons/[lessonSlug]/page.tsx`, YouTube and Vimeo URLs become an `<iframe>` embed. Anything else becomes a native `<video controls>`.
- **There's no** playback-position tracking, resume, watched-percentage, transcript, chapters, speed memory or protected streaming.
- Uploaded videos are served from a **public** Supabase bucket URL (up to 500 MB per file).

### 5.5 Assignments and assessments
- **Quiz:** `LessonQuizQuestion` has options and `correctOption`. It's **rendered as static text**, with no answering, scoring or attempt storage. (Answers are no longer sent to the page; uncommitted change.)
- **Practice lab:** coding exercises in Python (a limited transpiled subset), JavaScript and TypeScript, with test cases, hints and solutions. Submissions are stored. It now runs in a sandboxed browser Web Worker (uncommitted).
- **There's no** assignment entity, due dates, teacher grading, feedback or rubrics.

### 5.6 Reusable components
| Group | Components | Reuse value |
|---|---|---|
| UI primitives | `button`, `card`, `badge`, `input`, `textarea`, `dialog` (Radix) | High: the base for every workspace |
| Layout | `container`, `section`, `navbar`, `public-nav-drawer`, `footer`, `language-switcher` | High |
| Studio | `admin-shell`, `admin-page-header`, `stats-grid`, `resource-table`, `form-shell`, `row-actions`, `media-upload-field`, `activity-feed` | High: a template for the Teacher and Admin workspaces |
| Learning | `course-card`, `course-filters`, `curriculum-list`, `lesson-sidebar`, `lesson-study-shell`, `lesson-resume-tracker`, `practice-lab`, `course-enrollment-*` | High: the core of the Student workspace |
| AI | `era/lesson-chat` (LLM tutor), `era/era-guide-chatbot` (keyword FAQ matcher, **no LLM**) | `lesson-chat` is the seed of the Student Tutor |
| Analytics | `student-analytics-dashboard`, `tracked-link` | Medium |
| Shared | `empty-state`, `page-loading` | High |

### 5.7 Design tokens and styling
- HSL CSS variables (`--primary`, `--accent`, `--radius*`, fonts `--font-display`) mapped in `tailwind.config.ts`.
- Semantic utility classes in `globals.css`: `page-title`, `page-lead`, `section-title`, `card-title`, `eyebrow-label`, `surface-card`, `surface-panel`, `form-control`, `status-*` and others.
- `docs/design-system.md` documents typography, color, spacing, radius, buttons, inputs and surfaces.
- **Inconsistency:** many components still use arbitrary values, for example `rounded-[1.4rem]`, `rounded-[1.25rem]`, `rounded-[1.8rem]` and inline gradients, instead of tokens.

### 5.8 Responsive layout
- Mobile-first. The public header collapses to a drawer. The lesson page is a stacked layout that becomes a two-column grid at `xl`.
- Recent work (per `Daily_Improvements.md`) focused on mobile auth and navigation.
- The lesson page stacks **video → study sidebar → practice/quiz → chat → notes**. On mobile the AI tutor is far below the video, which conflicts with the "tutor beside the video" goal.

### 5.9 Existing AI integrations
| Feature | Implementation | Assessment |
|---|---|---|
| ERA lesson tutor | `POST /api/era/chat` → `generateEraAnswer` → Ollama `/api/chat` or OpenAI `chat/completions`. The system prompt includes the lesson notes, objectives and key points, plus the last 6 messages. Stored in `ChatMessage`. | A good base: a provider abstraction, server-side keys, per-user history |
| ERA Guide | A client-side keyword matcher over static FAQ entries | Not AI. Could later be replaced by the Admin or support assistant |
| Gaps | No streaming, no token or cost accounting, no per-user daily quota, no moderation, no assistant scope or role, no conversation threads, no documents or retrieval, no memory, no video transcript context | Every vision feature needs these |

### 5.10 Security-sensitive operations
| Operation | Location | Status |
|---|---|---|
| Session signing | `src/lib/auth.ts` | ✔ Sound. Dev fallback secret only outside production |
| Redirect sanitisation | `sanitizeNextPath` | ✔ Blocks `//` and absolute URLs |
| File upload signing | `api/admin/storage/upload` | ✔ Type, size and filename validated; path scoped to the user. ⚠ `upsert: true`; files publicly readable |
| File delete | `api/admin/storage/delete` | ✔ Instructors limited to own prefix. Admins can delete any path |
| Student code execution | `server/practice.ts` | ✔ Fixed (uncommitted): no server execution |
| LLM keys | `provider.ts` | ✔ Server-only env vars |
| Seed credentials | `prisma/seed.ts` | ⚠ Hard-coded admin password `EraAdmin2026!` |
| Rate limiting | `src/lib/rate-limit.ts` | ⚠ In-memory `Map`, so it isn't shared across serverless instances |

---

## 6. Classification: Keep, Improve, Replace, Missing

### Keep (works, fits the vision)
- Session auth model, bcrypt, password reset, account status checks.
- The Prisma content hierarchy (Subject → Category → Course → Module → Lesson) and `LessonContent`.
- The `ChatMessage` per-user, per-lesson history pattern. Its isolation by `userId` is correct.
- The AI provider abstraction and server-side key handling.
- The design system, UI primitives and studio shell components.
- Instructor ownership checks on course, lesson and material mutations.
- Upload validation and the user-scoped storage path scheme.
- The bilingual `en`/`uz` structure, SEO metadata, sitemap and OG images.
- The practice lab (with its new browser sandbox).

### Improve (keep the idea, modify it)
| Item | Change |
|---|---|
| Authorization | Add a central policy module (`canViewLesson`, `canManageCourse`, `canViewUser`, `scopeQueryForRole`) and use it everywhere |
| Lesson page | Gate it on enrollment. Restructure into a workspace layout with the tutor beside the video |
| Video player | Add a player component with time events, resume and progress. Use the YouTube IFrame API for embeds |
| AI tutor | Enrollment check, streaming, per-user quotas, transcript and timestamp context |
| Quiz | Make it interactive, graded on the server, with stored attempts |
| Studio | Split it into Teacher and Admin workspaces, and scope every instructor query |
| Enrollment | Support teacher- or admin-controlled access (invites or assignment) alongside self-enroll |
| Rate limiting | Move to persistent storage (database or Redis) |
| Onboarding | Make it optional, not a hard redirect |
| Styling | Replace arbitrary radius and gradient values with tokens |
| `User.status` | Should be an enum (schema change, deferred) |

### Replace (conflicts with the direction)
| Item | Reason | Replacement |
|---|---|---|
| A single `/admin` studio shared by two roles | The vision needs separate Teacher and Admin workspaces | `/teacher/*` and `/admin/*` built from the same components |
| Student pages inside the marketing site | The Student workspace needs its own shell | A `/learn/*` (or `/student/*`) workspace layout. Keep the public catalog for discovery |
| ERA Guide keyword bot | It isn't AI and overlaps the tutor | Fold it into the role assistants later. Keep it until then (no deletion) |
| A lesson-only `ChatMessage` as the whole AI data model | It can't represent multiple assistants, threads, documents or memory | New conversation and assistant entities (schema phase) |
| `LearningGoal` enum for subjects (AI, Math, English, Exam) | Hard-codes topics, which blocks new courses | Map goals to `Subject` records (schema phase) |

Nothing here is to be deleted now. Replacements are built alongside, then traffic moves over.

### Missing (needs building)
- **Workspaces:** role-specific shells and navigation for Student, Teacher and Admin.
- **Course authoring UI:** modules, lesson content, quizzes, exercises, reordering, draft and publish per lesson.
- **Access control for students:** invites, class or cohort grouping, teacher-assigned enrollment.
- **Video:** progress tracking, resume, watched threshold, transcripts with timestamps, protected hosting.
- **Assessments:** quiz attempts, assignments, due dates, grading, feedback.
- **Teacher tools:** class roster, per-student progress, at-risk signals, announcements.
- **AI infrastructure:**
  - assistant registry (student tutor, teacher assistant, admin assistant)
  - conversations and threads
  - per-user documents and files
  - personal memory
  - retrieval over course content
  - usage metering and quotas
  - audit log
  - moderation
- **Platform:** persistent rate limiting, automated tests, error monitoring, certificates, payments.

---

## 7. Technical risks

Severity: 🔴 must fix before real students, 🟠 fix before the AI and workspace rollout, 🟡 debt.

### 7.1 Role-based authorization
- 🔴 **Instructors can read every user's personal data.** `/admin/users` uses `getAdminUsers()` (`src/server/admin.ts:170`) with no role scoping, so name, email and phone of all users are shown to any instructor. (code-verified)
- 🟠 **Instructors can see platform-wide activity.** The instructor branch of `getAdminDashboardData()` loads `activityLog.findMany({ take: 6 })` with no filter (`src/server/admin.ts:44`). This exposes other users' names and actions. (code-verified)
- 🟠 **No per-page guards in the studio.** Pages rely on the layout guard plus action-level checks. Safe for mutations today, but any new page is visible to instructors by default.
- 🟡 **Instructor linking by email:** `getInstructorRecordForUser` matches `Instructor.email` to the user's email and **auto-links** it. Since admins create both records this is low risk, but it's implicit behaviour worth making explicit.
- 🟡 `getAdminUsers()` fetches full rows, including `passwordHash`. It isn't sent to the browser (the table is a server component that renders strings), but it's an unnecessary over-fetch.

### 7.2 User data isolation (critical for per-role AI)
- ✔ Chat history, practice submissions, completions and enrollments are all queried by `currentUser.id`.
- 🔴 **Isolation stops at the user level. There's no notion of assistant scope, workspace or tenant.** Before adding Teacher and Admin assistants, every AI record must carry `ownerUserId` plus `assistantScope`, and every query must filter on both. The current model can't express this (schema phase).
- 🟠 **No audit trail of AI usage or data access.** `ActivityLog` is free-form and isn't designed for security auditing.

### 7.3 Course enrollment permissions
- 🔴 **Lesson pages are public.** `getLessonBySlugs` checks only that the course and lesson are `PUBLISHED`. There's no session or enrollment check, so videos, notes and materials are open to anyone with the URL. (code-verified)
- 🔴 **`GET /api/lesson/[id]/context` is unauthenticated.** It returns full lesson content for any published lesson ID. (code-verified)
- 🟠 **The AI tutor has no enrollment check.** Any signed-in user can query any lesson, which matters for cost and content access.
- 🟠 **Progress tracking enrolls implicitly.** `POST /progress` upserts an `Enrollment`, so access rules added only to `/enroll` could be bypassed.
- 🟠 **`currentLessonId` isn't checked against the course.** In `POST /progress`, `lessonId` is validated but `currentLessonId` isn't. A client can set an enrollment's resume lesson to a lesson from **another course**. (code-verified)
- 🟡 Enrollment is always self-service and free. There's no model for teacher-controlled access.

### 7.4 Document storage
- 🔴 **Everything is in one public bucket.** Lesson videos, materials and thumbnails are uploaded to `SUPABASE_STORAGE_VIDEOS_BUCKET` and read through `/object/public/...` URLs. Gated content can't be protected, and per-user AI documents can't be stored here.
- 🟠 Upload signing uses `upsert: true`. Paths include a UUID, so collisions are unlikely, but overwrite should be off.
- 🟠 There's no record linking most uploaded objects to their owner, except `CourseMaterial`. Orphaned files aren't tracked.
- **Requirement for the vision:** private buckets with short-lived signed read URLs issued after an authorization check, and separate prefixes per scope (`courses/`, `users/{id}/student/`, `users/{id}/teacher/` and so on).

### 7.5 API security
- 🟠 **`POST /api/courses/[slug]/view` has no auth and no throttle.** Each call writes two rows and calls `revalidatePath("/")`. That makes it a cheap way to inflate metrics and purge the cache. (code-verified)
- 🟠 **Rate limiting is per instance only**, so it's weak on Vercel. This affects sign-in brute-force protection and AI cost control.
- 🟡 There's no CSRF token on JSON routes. `sameSite=lax` cookies and JSON content type mitigate this for now. Server Actions have built-in origin checks.
- 🟡 No security headers (CSP, frame-ancestors and similar) are configured in `next.config.ts`.

### 7.6 Database consistency
- 🟠 Derived counters are stored and recalculated on writes: `Enrollment.progress`, `UserXp`, `Streak`, `UserPathProgress` and `Course.viewCount`. If any sync step fails partway, they drift. (`POST /progress` runs about 5 sequential sync steps outside a transaction.)
- 🟡 `Lesson.duration` is free text, parsed by `parseDurationToMinutes`.
- 🟡 `User.status` is a string, not an enum.
- 🟡 Lesson create always sets `PUBLISHED`, with no draft workflow per lesson.
- 🟡 No migrations folder. The schema is applied with `prisma db push`, so there's no migration history. Introduce migrations before the schema phase.

### 7.7 Technical debt
- The database is unavailable, so runtime behaviour is unverified (section 0).
- No automated tests of any kind.
- `next lint` is deprecated (Next 16 will need the ESLint CLI).
- Large files: `src/server/courses.ts` (~1,000 lines), `src/app/admin/actions.ts` (~1,100), `prisma/seed.ts` (~1,100).
- Inline bilingual copy inside components makes translation and tone changes slow.
- The project lives in OneDrive, which corrupts the `.next` cache (`EINVAL readlink`).
- Hard-coded seed admin password.

---

## 8. Recommended changes (summary)

1. **Central authorization layer** in `src/lib/permissions.ts` (extend it, don't replace it): one function per decision, plus role-scoped query helpers. Use it for every page, action, route and AI tool.
2. **Gate the learning content.** Lesson page, lesson context API, AI chat and materials require an enrollment (or teacher or admin ownership).
3. **Fix the confirmed isolation leaks:** scope the users list and activity feed for instructors, validate `currentLessonId`, and throttle the view-tracking endpoint.
4. **Workspace shells** as new route groups that reuse existing components. Keep the existing routes working, with redirects later.
5. **A video player component** with time events, as the foundation for progress tracking and the video tutor.
6. **AI infrastructure design**: assistant scopes, conversations, documents, memory and quotas. Do it in a schema phase with proper Prisma migrations, after the auth layer exists.
7. **Private storage** with signed read URLs before any personal documents are stored.

---

## 9. Potential breaking changes

| Change | Who or what breaks | Mitigation |
|---|---|---|
| Enrollment gate on lessons | Visitors with direct lesson links; SEO for lesson pages | Keep course pages public. Show a lesson preview with an "Enroll to continue" message. Optionally mark one free preview lesson |
| Public bucket → private bucket | Every stored `fileUrl`, `videoUrl` and `thumbnailUrl` that holds a public URL | Keep public read for thumbnails and marketing assets. Migrate learning assets with a script that rewrites the URLs to storage paths |
| `/admin` split into `/teacher` and `/admin` | Instructor bookmarks, `sign-in?next=/admin` redirects | Keep `/admin` working for both roles at first, add `/teacher`, then redirect instructors |
| Instructor users list and activity scoping | Instructors who currently see all users | Intended. Communicate the change |
| `/progress` stops auto-enrolling | Any client relying on implicit enrollment | Enroll explicitly first. The course page already does |
| Optional onboarding | Analytics that assume every student finished onboarding | Treat onboarding fields as nullable everywhere (they already are in the schema) |
| Practice API contract (submit now needs `results`; new `/compile`) | Any external caller (none known) | Already handled in `practice-lab.tsx` |
| AI schema additions | `ChatMessage` consumers | Add new tables and backfill. Keep `ChatMessage` readable until it's migrated |
| Persistent rate limiting | None functionally | Needs a store (database table or Redis). A database table avoids a new dependency |

---

## 10. Migration strategy and implementation sequence

Principles: **build alongside, then switch.** Every phase leaves the app shippable. Authorization comes before features. Schema changes are batched into one planned phase using Prisma migrations.

### Phase 0: stabilise (prerequisite)
1. Provision a new database (Supabase), then `prisma db push` and a clean seed (the admin password comes from an env var).
2. **Run the full runtime test** that this audit couldn't: sign-in, enrollment, progress, chat, uploads, admin CRUD. Record the results in this file.
3. Commit the practice-lab hardening after `next build` passes.
4. Move the repository out of OneDrive.

### Phase 1: authorization and isolation (no schema change)
1. Extend `src/lib/permissions.ts` with a policy API (`canViewLesson`, `canManageCourse`, `canViewStudent`, `assertRole`).
2. Gate the lesson page, `/api/lesson/[id]/context`, `/api/era/chat` and lesson materials on enrollment or ownership.
3. Scope the instructor queries: users list, activity feed.
4. Validate `currentLessonId` and stop implicit enrollment in `/progress`.
5. Throttle and deduplicate `/view`. Remove `revalidatePath` from that hot path.
6. Add per-page role guards in the studio.
7. Add the first automated tests: permission unit tests, then API integration tests for the gated routes.

### Phase 2: workspace shells (no schema change)
1. A `(student)` route group: `/learn` dashboard (from `/my-learning`) and a lesson workspace layout with the tutor panel beside the video.
2. A `(teacher)` route group: `/teacher` dashboard, courses, lessons, materials, students and progress. Reuse the studio components with instructor-scoped queries.
3. Keep `/admin` for platform administration: users, taxonomy, settings, instructors.
4. Role-aware sign-in redirects. The old routes keep working.

### Phase 3: authoring and assessment (UI over the existing schema)
1. Teacher UI for modules, lesson content (notes, objectives, key points), quiz questions and practice exercises. All of these models already exist.
2. An interactive quiz graded on the server, with answers kept on the server. Storing attempts needs a model, so it goes in Phase 5 or a minimal schema addition.
3. Draft and publish per lesson in the UI (the `status` field already exists).

### Phase 4: the video learning experience
1. A shared `<LessonPlayer>`: native `<video>` plus the YouTube and Vimeo player APIs, emitting time, pause and end events.
2. Resume position and the watched threshold, saved through the existing progress API at first. A dedicated field comes with the schema phase.
3. Protected video hosting decision and integration (Bunny Stream, or a private bucket with signed URLs).
4. The tutor panel receives `{ lessonId, currentTime }`, ready for transcript context.

### Phase 5: AI infrastructure (planned schema phase)
Design review first. Then, in one migration set:
- `Assistant` (scope: STUDENT_TUTOR, TEACHER_ASSISTANT, ADMIN_ASSISTANT)
- `Conversation` (owner, assistant, optional course and lesson)
- `Message`
- `UserDocument` (owner, scope, storage path)
- `MemoryItem` (owner, scope)
- `AiUsage` (tokens, cost)
- `LessonTranscript` (timestamped segments)
- `QuizAttempt`
- `LessonProgress` (seconds watched)

Then:
- a shared AI service: provider abstraction (existing), streaming, quotas, moderation, retrieval over course content and transcripts, and audit logging
- a hard rule that every AI read and write filters on `ownerUserId` and `assistantScope`, enforced in one data-access module and covered by tests
- migrating `ChatMessage` into `Conversation`/`Message`

### Phase 6: role assistants
1. **Student AI Tutor** (priority): video-synced, transcript-aware, enrollment-scoped, with per-student memory and quotas.
2. **Teacher assistant:** lesson drafting, quiz generation from transcripts, class insights. It may only see the teacher's own courses and students.
3. **Admin assistant:** platform analytics and support. Read-only, with audited tool access.

### Phase 7: hardening and growth
- Private storage migration, persistent rate limiting, security headers, error monitoring, end-to-end tests.
- Certificates, payments, flexible subjects (replace the `LearningGoal` mapping), multiple instructors and cohorts.

---

## 11. Final assessment

**The current codebase is a solid foundation, but it's not ready for multi-role AI.** UI, data model and coding conventions are good enough to keep and extend. The blocking issue is **authorization and isolation**:

- learning content is public
- instructors can see platform-wide personal data
- the AI layer has no concept of scope

These are fixable without redesign, schema changes or new dependencies (Phase 1), and they must be fixed before any assistant reads personal documents or memories.

The recommended path:
1. stabilise and test at runtime (Phase 0)
2. centralise authorization (Phase 1)
3. carve out workspaces from existing components (Phase 2)
4. build authoring and the video experience (Phases 3–4)
5. only then introduce the AI data model in one planned schema migration (Phase 5) and ship the Student AI Tutor first (Phase 6)

This order gets ERA to the AI-first vision step by step, with the app working at every stage.
