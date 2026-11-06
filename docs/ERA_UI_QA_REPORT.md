# ERA Academy: UI, Responsive, Accessibility and Security QA Report

**Date:** 5 November 2026
**Covers:** Prompt 04 (Teacher and Admin workspaces), Prompt 05 (Student workspace and ERA classroom) and Prompt 06 (this QA pass).
**Read with:** [`ERA_INFORMATION_ARCHITECTURE.md`](ERA_INFORMATION_ARCHITECTURE.md), [`ERA_DESIGN_SYSTEM.md`](ERA_DESIGN_SYSTEM.md), [`ERA_DESIGN_SYSTEM_VERIFICATION.md`](ERA_DESIGN_SYSTEM_VERIFICATION.md).

---

## 1. Summary

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ Pass |
| ESLint (`next lint`) | ✅ No warnings or errors |
| Production build | ✅ Pass (26 pages) |
| Browser QA suite (3 roles, real Chrome) | **110 / 113** automated checks. The 3 misses were confirmed working in follow-up runs (§4.4) |
| Console errors during QA | **0** |
| Horizontal overflow | **0** on every workspace page and the classroom, at every tested width |
| Bugs found and fixed in this phase | **11** (§5) |
| Automated test suite in the repository | None exists, so none could be run (pre-existing, audit §7.7) |

**Overall:** the three workspaces and the classroom work end to end with real data, role boundaries hold on the server, and the layouts work from 1440px down to 360px. The remaining issues (§6) are mostly planned backend work (homework, AI context fields, private storage) and pre-existing findings from the audit.

---

## 2. What was built

### 2.1 Teacher Workspace (`/teacher`)
| Page | Contents | Data |
|---|---|---|
| Dashboard | Welcome, metrics (active courses, students, practice exercises, pending assignments), quick actions, active courses, recent student activity, recently created lessons | Real, scoped to the teacher |
| My courses | Search, status filter, sorting, thumbnail, description, students, status, last updated, actions | Real |
| Lessons | Course picker, lessons grouped by module, status, content indicators (video, notes, quiz, practice), Edit and Preview | Real |
| Assignments | Practice exercises with submission counts and auto-checked pass rates. **Homework with deadlines doesn't exist yet** (S-ASSIGN); the page says so | Real |
| Students | Only students enrolled in the teacher's own courses: name, enrolled courses with progress, average progress, practice status, recent activity. No emails, phones or tutor conversations | Real |
| ERA Assistant | Conversation area, composer, file-upload entry point, suggested requests, in-page history, New conversation. **Not connected**: says so and sends nothing | UI only |

### 2.2 Admin Workspace (`/admin`)
| Page | Contents | Data |
|---|---|---|
| Overview | Students, teachers, active courses, organizations (labelled "not set up yet"), enrollments, course completion, recent platform activity | Real |
| Users | Tabs (All, Students, Teachers, Administrators) with counts, search (name, email, phone), status filter, typed-confirmation delete, create form | Real |
| Courses | The existing course editor, now with a Students column | Real |
| Analytics | Enrollments per week, average progress by course, platform activity per day, ERA Tutor questions per day; each chart has a table view. **AI cost and token tracking is a labelled placeholder** (S-USAGE) | Real, plus a placeholder |
| Admin Assistant | Same assistant UI with admin prompts. **Not connected** | UI only |
| Existing editors | Lessons, materials, subjects, categories, teacher profiles, progress, settings: now inside the workspace shell | Real |

### 2.3 Student Workspace (`/learn`) and the ERA classroom
| Page | Contents |
|---|---|
| Dashboard | Continue Learning (course, next lesson, progress, last studied) first; metrics; my courses; upcoming assignments (honest empty state); recent feedback from practice results; study history; ERA Tutor entry |
| My courses | Enrolled courses with progress and Continue |
| Course page | Overview, description, instructor, outcomes, modules and lessons with completion, progress; access-denied state for courses the student isn't enrolled in |
| **Classroom** | **Desktop:** course navigation (left), video and lesson (centre), persistent ERA Tutor (right, docked at ≥1280px, overlay below). **Mobile:** sticky video, lessons in a drawer, tutor as a bottom sheet, floating Ask ERA |

Classroom features:
- **Video:** native controls, playback speed, fullscreen, bookmarks, resume from the last position (with Start over), auto-complete at 90% watched.
- **Raise hand menu:** Ask a question, Explain this moment, Give an example, Explain in Uzbek, Ask by voice (disabled, "Coming soon"). It never pauses the video.
- **Tabs:** Overview, Notes, Materials, Practice, Quiz, Bookmarks.
- **ERA Tutor:**
  - lesson context chips
  - saved conversation history
  - suggested questions
  - attach "this moment"
  - formula, table, code and clickable-timestamp rendering
  - follow-up actions
  - honest error states
  - attachment and voice buttons as future-ready controls

**Tutor integration point:** `src/lib/era/tutor-client.ts`. It defines the full future context (student, organization, course, lesson, video, timestamp, transcript segments, materials). Today it sends only the lesson ID, the question and an optional moment to the existing `/api/era/chat`; the server derives everything else.

### 2.4 Shared pieces
- `WorkspaceShell`: role navigation, language switcher, account menu, workspace switcher for admins.
- `src/server/workspace.ts`: server guards.
- Teacher, admin and student data layers.
- `StatStrip`, `FilterBar`, `ListPanel`, `BarChart` (single-series, validated colour, table view), `WorkspaceAssistant`, and workspace error and loading states.

No database schema, authentication or AI backend changes were made.

---

## 3. How it was tested

| Item | Detail |
|---|---|
| Database | A local Postgres started with `prisma dev`, loaded with the existing seed and seed scripts. **`.env` was not changed**; the local URL was passed only to test commands |
| Test fixtures | `.tmp/local-fixtures.ts` (git-ignored, refuses to run against non-localhost databases): teacher logins linked to the seeded instructor profiles, enrollments, completions, practice results, one saved tutor conversation, and a local copy of a Creative Commons video (Big Buck Bunny, CC BY 3.0) |
| Browser | Headless Chrome driven over the DevTools protocol with real keyboard and mouse input, one profile per role. The scripts lived in the session scratch folder and are not committed |
| Roles | Student (Mina), Teacher (David, owns 4 of 6 courses), Admin |
| AI provider | Not configured locally, so the tutor's **real** answers weren't tested. The unavailable state was; see §6 |

### 3.1 Pages tested
- **Student:** `/learn`, `/learn/courses`, `/learn/courses/[course]` (enrolled, not enrolled, unknown), the classroom (two lessons), and the practice lab.
- **Teacher:** `/teacher`, `/teacher/courses` (search, filter, empty results), `/teacher/lessons`, `/teacher/assignments`, `/teacher/students`, `/teacher/assistant`, Teacher Preview of a lesson, `/admin/courses` as a teacher, and five admin-only pages as a teacher.
- **Admin:** `/admin`, `/admin/users` (tabs, search, delete dialog), `/admin/analytics`, `/admin/assistant`, `/admin/courses`, Admin inspection of a lesson, and `/teacher` as an admin with no teacher profile.
- **Public:** `/`, `/courses`, `/sign-in`, `/sign-up`, `/about`, `/faq` (from the design-system verification).

### 3.2 Screen sizes tested
| Width | Classroom | Teacher pages | Admin pages | Student dashboard |
|---:|---|---|---|---|
| 1440 | ✅ | ✅ | ✅ | ✅ |
| 1280 | ✅ | — | — | — |
| 1024 | ✅ | ✅ | ✅ | — |
| 768 | ✅ | ✅ | ✅ | — |
| 390 | ✅ | ✅ | ✅ | — |
| 360 | ✅ | ✅ | ✅ | — |

---

## 4. Results

### 4.1 Role-based UX
| Check | Result |
|---|---|
| Student sign-in with `next=/learn` lands on the Student dashboard | ✅ |
| Teacher sign-in ends in the Teacher Workspace (`/admin` → `/teacher`) | ✅ |
| Admin sign-in lands on the Admin overview | ✅ |
| Each role sees its own navigation (Student: Home, My courses, Browse; Teacher: six items plus content tools; Admin: grouped People, Content, Insights) | ✅ |
| A student opening `/teacher` or `/admin/users` is redirected away | ✅ |
| A teacher opening `/admin`, `/admin/users`, `/admin/subjects`, `/admin/analytics`, `/admin/assistant` ends on `/teacher` with no admin data | ✅ |
| An admin without a teacher profile sees an honest "not linked" state in `/teacher` | ✅ |
| Signed-out visitors to `/learn`, `/teacher`, `/admin` get a **307** redirect to sign-in | ✅ (after fix §5 #2) |

### 4.2 Student classroom
| Check | Result |
|---|---|
| 1440: course navigation 288px left, lesson centre, tutor docked 380px right, current lesson marked | ✅ |
| Tutor header: "ERA Tutor", course and lesson context; no internal IDs anywhere in the page text | ✅ |
| Saved conversation renders a formula (`role="math"`), a table, a code block, a clickable 0:42 timestamp, the lesson-first note and follow-up actions | ✅ |
| **Closing and reopening the tutor keeps the same `<video>` element playing, time not reset** | ✅ |
| Raise hand menu has 5 actions (voice disabled, "Coming soon"); Explain this moment sends a question tied to the video time **without pausing** | ✅ |
| With no AI provider configured, the tutor shows "ERA is temporarily unavailable" (no fake answer) | ✅ |
| Bookmark saves the current moment and lists it | ✅ |
| Reload resumes at the saved position ("Resumed at 1:05", Start over) | ✅ (after fix §5 #3) |
| Mark lesson complete uses the existing progress API and updates the page | ✅ |
| Practice lab: compile, run in the browser, save, show per-check feedback | ✅ (after fix §5 #1) |
| Video keeps 16:9 at 1440, 1280, 1024, 768 | ✅ |
| **390 and 360:** tutor closed on load, Ask ERA visible, lessons in a drawer, no overflow | ✅ (after fix §5 #5) |
| **390 and 360:** tutor opens as a half-height sheet **below** the visible video; closing returns to the same playing video | ✅ |
| **390 and 360:** Lessons drawer opens with the current lesson marked | ✅ |
| Empty conversation shows the five suggested questions | ✅ (checked by code and visually; history existed in the run) |
| Long AI responses | ✅ The panel body scrolls; the composer stays fixed; tables and code scroll horizontally inside the answer |

### 4.3 Responsive
- **35 / 35** overflow checks on teacher and admin pages at 1440, 1024, 768, 390 and 360px (after fixes §5 #6–7).
- **9 / 9** classroom checks at every width.
- No overlapping components were seen in the screenshots reviewed (the classroom at 1440, 1024, 390 and 320; the student course page; admin analytics; admin users on a phone).

### 4.4 The three automated misses, confirmed separately
| Check | Why the automated check missed | Confirmation |
|---|---|---|
| Course page lists modules and lessons | Selector too narrow | A follow-up run found all 3 lesson links; screenshot shows both modules, completion marks and "2 of 3 lessons completed" |
| Practice lab result | The development server compiled the submit route for 13 seconds; the test waited 9 | A follow-up run showed the result ("0/2" with expected and actual output) after 13 seconds; it passed in the previous full run |
| Teacher on `/admin/subjects` | The development server compiled the page for longer than the test waited | A follow-up run ended on `/teacher` ("Welcome back, David") with no subject data or forms |

### 4.5 Accessibility
| Check | Result |
|---|---|
| One `h1` and one `main` on every tested page (student dashboard, classroom, 3 teacher pages, 4 admin pages) | ✅ 9/9 |
| No visible button or link without an accessible name; no visible input without a label | ✅ 9/9 |
| Skip links: "Skip to content" in workspaces, "Skip to lesson" in the classroom | ✅ |
| Navigation: `aria-current="page"` on the active item and the current lesson; completion announced in curriculum links | ✅ |
| Charts: one series, validated colour (dataviz validator: all checks pass), focusable bars with labels, "Show as table" | ✅ |
| Status changes: toasts, tutor status and one announcement per tutor answer | ✅ (live-region behaviour verified in the design-system review) |
| Dialogs: typed confirmation for deleting a user; Cancel focused first | ✅ |
| Form fields at 16px on phones; targets at least 24px | ✅ (design-system review) |
| Known gap: focus trap in the full-height mobile tutor sheet | ❌ Not implemented (design-system review §7) |

### 4.6 Security-related UI checks (server-side, with real data)
| Check | Result |
|---|---|
| A student can't open a course they aren't enrolled in: access denied with an enroll link, **no lesson content sent** | ✅ |
| An unknown course returns not found | ✅ |
| A teacher sees **only their own courses** (dashboard, course list, existing course editor) | ✅ |
| A teacher's Students page lists only students in their own courses, **no emails or phone numbers in the HTML**, and a shared student's other teacher's course isn't shown | ✅ |
| A teacher opening another teacher's course in `/learn` gets not found | ✅ |
| **Teacher Preview:** banner shown, **no tutor, no hand raise, no progress saving, practice disabled** | ✅ |
| **Admin inspection:** banner shown, **no tutor and no conversations** | ✅ |
| Admin analytics shows tutor question **counts** only; conversation text never appears | ✅ |
| Practice solution text isn't in the lesson page or in browser JavaScript (`.next/static`: 0 matches) | ✅ |
| Hidden navigation isn't treated as access: every check above calls the page directly by URL | ✅ |
| Organization permissions | ⚠ Not testable: ERA has no organization model yet (OD-1) |

### 4.7 Performance
| Area | Finding |
|---|---|
| JavaScript per route (first load) | Workspace pages about 172 KB; classroom 215 KB; assistant pages 190 KB; shared 102 KB. The classroom is the largest because it includes the practice lab, tutor and player |
| Video | `preload="metadata"`: only metadata downloads until play. The YouTube API script loads only for YouTube lessons |
| Layout shift | The video frame reserves 16:9 space before loading; loading states use skeletons. Not measured with a CLS tool |
| Network requests | The classroom makes one tutor-history request per lesson; the resume tracker posts once per lesson open (existing). No polling except the YouTube position (every 5 seconds, YouTube lessons only) |
| Re-renders | The video is never re-rendered by tutor activity: the player handle lives in a ref, and the tutor panel is a sibling (verified by the same-element test) |
| Images | Course thumbnails are CSS backgrounds, so they aren't optimised by `next/image`. Only Unsplash is allowed in `next.config.ts` (pre-existing) |
| Console | 0 errors and 0 uncaught exceptions across all three role runs |

---

## 5. Issues found and fixed in this phase

| # | Issue | Origin | Fix |
|---|---|---|---|
| 1 | **The practice lab never worked.** The client read `payload.data`, but API responses are flat (`{ ok, ...data }`), so every Run checks failed with a generic error | **Pre-existing** (original code); repeated in my task 7 rewrite | Read the flat payload in `practice-lab.tsx`. Verified end to end |
| 2 | Signed-out visitors to `/learn` and `/teacher` got **200** with a browser-side redirect, because `loading.tsx` starts streaming before the page guard runs (no data was sent) | New | Guards in `teacher/layout.tsx` and `learn/layout.tsx` → **307** |
| 3 | Video resume could be skipped: the server-rendered `<video>` sometimes loaded metadata before React attached `onLoadedMetadata` | New | Also check `readyState` on mount (`lesson-player.tsx`) |
| 4 | Moving to the next lesson kept per-lesson state (90% flag, completed state, attached moment), so auto-complete wouldn't fire on the next lesson | New | Classroom keyed by lesson ID |
| 5 | On phones, a remembered "open" tutor covered half the video on load | New | Remember the docked preference only at ≥1280px; narrower screens always start closed |
| 6 | `/admin/courses` overflowed by up to 675px below 1280px: the table's card was a grid item with `min-width: auto` | New (exposed by the narrower workspace layout) | `min-w-0` on `ResourceTable`'s card |
| 7 | `/admin/users` overflowed by 28px at 768px: the screen-reader-only "Actions" label (absolutely positioned) escaped the table's scroll container | New | `relative` on the table scroll containers |
| 8 | The analytics page passed a function prop from a server component to the client chart | New (caught before runtime) | `valueSuffix` string instead of `formatValue` |
| 9 | **Instructors could open admin-only pages by URL**, including `/admin/users` with every user's email and phone (audit A-7.1, D5) | **Pre-existing** | Admin-only guards on users, subjects, categories, teacher profiles, analytics, assistant and the overview |
| 10 | The instructor dashboard showed a **platform-wide** activity feed (audit A-7.1, D4) | **Pre-existing** | Instructors now use the Teacher dashboard, scoped to their own courses |
| 11 | Existing studio queries **fail open**: an instructor with no linked profile would see every course | **Pre-existing** (`src/server/admin.ts`) | New teacher queries **fail closed** (no profile means no data). The existing editor queries are unchanged; see §6 |

---

## 6. Remaining issues

### 6.1 Introduced or left by this phase
| Issue | Effect | Recommendation |
|---|---|---|
| Video position is saved **per device** (local storage) | It doesn't follow the student to another device | Add server-side video progress (S-VIDEO) |
| The "this moment" timestamp is sent as text appended to the question | Works with today's backend, but isn't structured | Add `timestampSeconds` to `/api/era/chat` when the retrieval backend is built (`tutor-client.ts` is ready) |
| Tutor answers carry no sources yet | The lesson-first note is shown, but there are no "from the lesson" labels | The UI already renders `sources` when the backend returns them |
| Stop cancels the tutor request in the browser only | The server may still finish and save the answer (it then appears in history); the student is told this | Add server-side cancellation when the backend streams |
| The layout guard's sign-in return address is the workspace root (`/learn`), not the exact lesson | After signing in, the student lands on the dashboard rather than the lesson | Pass the full path from middleware, or keep relying on the page-level `next` |
| Students who sign in without a `next` still land on the old `/my-learning` | Two dashboards exist; the navbar links to `/learn` | Redirect `/my-learning` → `/learn`, or change the sign-in default (an auth-flow change, deliberately not made) |
| Teacher and Admin workspace text is English only | The Student workspace and all shells are bilingual | Add Uzbek copy before teacher onboarding |
| Teachers still create and edit content in the older `/admin` editors | They work and are scoped, but aren't redesigned | The lesson editor and course builder (IA T5–T7) are the next build |
| Quiz is display-only; no homework, grading or organizations | Labelled honestly in the UI | Needs S-QUIZ, S-ASSIGN, S-ORG schema work |
| Tutor answers from a real AI provider weren't tested | The provider isn't configured locally | Configure `ERA_LLM_PROVIDER` and re-test long answers and formulas |
| No focus trap in the full-height mobile tutor sheet | Keyboard users can Tab behind it | Make the sheet modal at full height |

### 6.2 Pre-existing, not changed (still open)
| Finding | Status |
|---|---|
| The **legacy** lesson route `/courses/[c]/lessons/[l]` is still public (A-7.3) | The new `/learn` classroom is enrollment-gated; the old route still exists and still exposes content. **Redirect it to `/learn` or gate it before real content goes live** |
| `GET /api/lesson/[id]/context` is unauthenticated (A-7.3) | Unchanged |
| `/api/era/chat` doesn't check enrollment (A-7.3) | Unchanged. The new classroom only shows the tutor to enrolled students, but the API itself is open to any signed-in user |
| `POST /progress` enrolls implicitly and doesn't validate `currentLessonId` (A-7.3) | Unchanged |
| Existing `/admin` editor queries fail open for instructors without a linked profile | Unchanged (see §5 #11) |
| Videos and materials are in a public bucket (A-7.4) | Unchanged |
| 59 opacity classes produce no CSS | Unchanged (design-system review) |
| `app/error.tsx` uses a serif font and nested `<html>` | Unchanged; workspaces now use their own error state |
| OneDrive file locking breaks the dev cache (`EPERM`), causing occasional transient 404s while compiling | Environment. **Move the project out of OneDrive** |
| No automated test suite in the repository | Unchanged. The QA scripts used here could become the first end-to-end tests on request |

---

## 7. How to reproduce locally

1. Start the local database: `npx prisma dev -n era-local -d`. It prints a `postgres://…` URL; add `&pgbouncer=true&connection_limit=1` to it.
2. Run these with `DATABASE_URL` set to that URL (in the shell, not `.env`):
   - `npx prisma db push`
   - `npx tsx prisma/seed.ts`
   - the three `scripts/ensure-*.ts` scripts
   - `npx tsx .tmp/local-fixtures.ts`
3. Start the app with the same variable: `npx next dev -p 3600`.
4. Sign in with the local test accounts:

| Role | Email | Password |
|---|---|---|
| Student | `mina@eraacademy.com` | `EraStudent2026!` |
| Teacher | `david@eraacademy.com` | `EraTeacher2026!` |
| Admin | `admin@eraacademy.com` | `EraAdmin2026!` |

These passwords come from the seed and the local fixtures. They must never be used on a real database (audit finding: hard-coded seed admin password).
