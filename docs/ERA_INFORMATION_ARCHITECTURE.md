# ERA Academy: Information Architecture

**Date:** 5 November 2026
**Status:** version 1, ready for UI/UX design. It contains the workspace map (1), security boundaries (2), the complete page hierarchy (3), global layout (4), screen specifications (5), teacher, student and admin journeys (6–8), shared intaeraction patterns (9), assistant context boundaries (10), open product decisions (11) and the dependency register (12).

**Read first:** [`docs/ERA_PRODUCT_AUDIT.md`](ERA_PRODUCT_AUDIT.md), especially section 7 (Technical risks). Finding references in this document, such as **A-7.3**, point to that section.

**Scope of this phase:** documentation only. No code, database, API or authentication changes. Existing vulnerabilities are **recorded, not fixed**, here.

---

## 0. How to read this document

### Status labels

Every screen, journey step and feature carries one label.

| Label | Meaning |
|---|---|
| **[EXISTS]** | Works in the current code today (possibly at a different URL). Design may restyle it, but the behaviour exists |
| **[PARTIAL]** | Some of it exists; the gap is described next to the label |
| **[PLANNED]** | Doesn't exist. It needs new UI, and possibly backend or schema work |
| **[BLOCKED: code]** | Planned and must not ship until the listed dependency exists |

### Dependency codes

- **D1–D12**: navigation decisions that depend on backend security fixes (section 2.7).
- **A-7.x**: findings in the product audit.
- **S-codes**: new data the backend must store. They need schema work, which is out of scope for this phase. Full list in section 12.

| Code | What's needed |
|---|---|
| S-ASSIGN | Homework (assignment), submission, grade and feedback records |
| S-QUIZ | Quiz attempts and scores |
| S-VIDEO | Saved video position and watched percentage per lesson |
| S-TRANSCRIPT | Timestamped lesson transcripts |
| S-AI | Assistants, conversations, messages, memory and personal documents, with owner and scope |
| S-USAGE | AI usage and quota records |
| S-ORG | Organizations (schools or centres) and membership |
| S-ACCESS | Invites, cohorts or classes, and per-course access settings |
| S-NOTIFY | Notifications and announcements |
| S-AUDIT | Security audit log |
| S-STORAGE | Private file storage with signed read links (infrastructure, not only schema) |

### Terms
- **Teacher** = the `INSTRUCTOR` role in the code.
- **ERA Tutor** = the Student AI assistant. **ERA Assistant** = the Teacher AI assistant. **Admin Assistant** = the Admin AI assistant.
- **Coursework** = completions, quiz results, practice results and homework. It's visible to the course's teacher.
- **Private data (L4)** = AI conversations, AI memory, personal documents. Owner only (section 2.4).

---

## 1. Baseline workspace map

This is the proposed target structure from audit section 10, Phase 2. It exists so the access rules in section 2 have concrete pages to refer to. Paths are proposals and may change in the full IA design.

| Workspace | Base path | Primary users | Main areas (proposed) |
|---|---|---|---|
| Public site | `/` | Everyone | Home, About, FAQ, Subjects, Course catalog, Course detail, Sign in / Sign up |
| **Student Workspace** | `/learn` | Students | Dashboard, My courses, Lesson workspace (video plus AI Tutor), Practice, Quizzes, My AI conversations, My documents, Profile and settings |
| **Teacher Workspace** | `/teacher` | Instructors (and admins acting as teachers) | Dashboard, My courses, Course builder (modules, lessons, content, quizzes, exercises), Media library, Students (per course), Progress, Announcements, Teacher Assistant |
| **Admin Workspace** | `/admin` | Admins | Platform dashboard, Users and roles, Instructors, Subjects and categories, Site settings, Audit log, AI usage and quotas, Admin Assistant |

Existing routes (`/my-learning`, `/courses/[slug]/lessons/[slug]`, the current `/admin/*`) keep working until the workspaces replace them (audit section 9).

---

## 2. Security-Aware Navigation and Access Boundaries

### 2.1 Core principle: navigation is not authorization

> **Hiding a link never protects a page.** Every page, server action, API route and AI tool must check permission **on the server**, on **every request**, whatever the navigation shows.

The audit shows why. Today `/admin/users` doesn't appear as a primary task for instructors, but any instructor who types the URL sees every user's email and phone (**A-7.1**). Lesson URLs aren't linked for non-enrolled visitors, but they open for anyone (**A-7.3**).

Rules for the future UI:

1. **Two separate layers, one source of truth.** Navigation visibility and backend permission are different layers. Both must call the **same policy functions** (planned in `src/lib/permissions.ts`, audit Phase 1). Navigation calls them to decide what to show; the server calls them to decide what to allow. A navigation item must never exist without a matching server check.
2. **Deny by default.** A new page, route, action or AI tool is inaccessible until a policy explicitly allows it. In particular, it must not inherit access from a layout guard. The current studio layout lets instructors into every `/admin/*` page (**A-7.1**).
3. **The client never decides access.** Role, enrollment and ownership come from the server session and the database (`getCurrentUser()`), never from props, URL parameters, local storage or the cookie-only `getSession()` display data.
4. **Hidden data is never fetched.** Don't load data and then hide it with CSS or conditional rendering. If a user can't see a field, the server query must not select it.
5. **Workspace sets scope, not just layout.** The same person may see different data in different workspaces. An admin opening the Teacher Workspace sees **only the courses they own**, under teacher rules. Platform-wide views exist only in the Admin Workspace, where access is audited.
6. **IDs in URLs aren't permission.** Every `[courseId]`, `[lessonId]`, `[studentId]` or `[conversationId]` in a path is checked against the current user's relationship to that record. A guessed ID must return "not found", not someone else's data.

#### Navigation visibility versus backend permission

| Concern | Navigation layer (UX only) | Backend layer (enforced) |
|---|---|---|
| Purpose | Show the user what they can usefully do | Decide what the user is allowed to do |
| Source | Policy functions, called during render | The same policy functions, called in every page loader, action, route and AI tool |
| On failure | The item is hidden or disabled with an explanation | `401` (not signed in), `403` (signed in, not allowed), or `404` for records the user mustn't know exist |
| May be bypassed | Yes (typed URLs, scripts, old links) | No |
| Example | "Students" appears in the Teacher sidebar | `/teacher/courses/[id]/students` checks that the course belongs to the teacher, and the query only selects that course's enrollments |

### 2.2 Access levels

Every page and operation is assigned one of these levels. The level is a property of the **data**, not the menu.

| Level | Name | Rule | Examples |
|---|---|---|---|
| **L0** | Public | No session needed | Home, catalog, course detail, FAQ |
| **L1** | Authenticated | Valid session plus an `ACTIVE` account | Profile, language preference |
| **L2** | Role | L1 plus a required role | Teacher Workspace shell, Admin Workspace shell |
| **L3** | Relationship | L2 plus a relationship to the specific record: an **enrollment** (student ↔ course) or **ownership** (teacher ↔ course) | Lesson workspace, the course builder, a course's student list |
| **L4** | Owner-private | Only the person the data belongs to. **No role, including admin, gets routine access** | A student's AI conversations, AI memory, personal documents, private notes |
| **L5** | Exceptional access | Admin plus a stated reason plus explicit confirmation plus an audit record, for a narrow legal, safety or support purpose | Investigating a reported abuse case, fulfilling a data-deletion request |

L5 is a **process, not a page**. No navigation item may link to it directly (see 2.4).

### 2.3 Page and operation access matrix

"Current state" records what the code does today (from the audit). It's documented, not fixed in this phase.

#### Public site and authentication

| Page or operation | Level | Required server check | Current state |
|---|---|---|---|
| Home, About, FAQ, Subjects, Course catalog | L0 | Published content only | ✔ Matches |
| Course detail (curriculum list) | L0 | Published course; show lesson **titles** only | ✔ Matches |
| Sign in, Sign up, Forgot password | L0 | Rate limited; `next` redirect sanitised | ✔ Sanitised. ⚠ Rate limit is per instance (**A-7.5**) |
| Self-enroll ("Add to My Learning") | L1 + STUDENT | Course is published and open for self-enrollment | ⚠ Any published course; no access model (**A-7.3**) |

#### Student Workspace (`/learn`)

| Page or operation | Level | Required server check | Current state |
|---|---|---|---|
| Dashboard, My courses | L2 STUDENT | Only the current user's enrollments | ✔ Scoped by user (`/my-learning`) |
| Lesson workspace: video, notes, materials | **L3 enrollment** | Enrollment in the lesson's course, **or** teacher ownership, **or** an admin in the Admin Workspace | 🔴 **Public today** (**A-7.3**) |
| Lesson context API | L3 enrollment | Same as the lesson workspace | 🔴 **Unauthenticated** (**A-7.3**) |
| AI Tutor in a lesson | L3 enrollment plus quota | Enrollment, a per-user quota, and the conversation's owner is the current user | 🟠 Signed in only; no enrollment check (**A-7.3**) |
| My AI conversations | **L4** | Owner only | ✔ History is scoped by user. No conversation model yet (**A-7.2**) |
| My documents, AI memory | **L4** | Owner only; private storage | ⛔ Doesn't exist; blocked on private storage (**A-7.4**) |
| Practice submit, quiz attempt | L3 enrollment | Enrollment; results are checked on the server against the course | ⚠ Practice requires sign-in only |
| Progress and resume | L3 enrollment | Enrollment **must already exist**; the resume lesson must belong to the course | 🟠 Auto-enrolls; `currentLessonId` not validated (**A-7.3**) |

#### Teacher Workspace (`/teacher`)

| Page or operation | Level | Required server check | Current state (`/admin` today) |
|---|---|---|---|
| Teacher dashboard | L2 INSTRUCTOR | Every widget is scoped to the teacher's own courses | 🟠 Activity feed is platform-wide (**A-7.1**) |
| My courses, Course builder | **L3 ownership** | `course.instructorId` is the teacher's instructor record | ✔ Enforced on mutations (`assertCourseManagementAccess`). ⚠ Lists aren't consistently scoped |
| Media library, uploads | L3 ownership | Upload paths are scoped to the user; reads use signed URLs | ⚠ Uploads scoped; **reads are public** (**A-7.4**) |
| Course students list | **L3 ownership** | Only students **enrolled in this teacher's course**, and only the fields needed (name, progress) | 🔴 Must **not** reuse `getAdminUsers()`, which returns everyone's email and phone (**A-7.1**) |
| Student progress in a course | L3 ownership | Coursework for **this course only**: completions, quiz scores, practice results | ✔ `/admin/progress` is scoped |
| A student's AI Tutor conversations | **L4, not accessible** | No route, no API, no assistant tool | ✔ Nothing exposes them today. Keep it that way (2.4) |
| Teacher Assistant | L3 ownership | Tools can only read the teacher's own courses and aggregate class data | ⛔ Doesn't exist |
| Taxonomy (subjects, categories) | Read-only for teachers | Lists only; changes are admin-only | ✔ Mutations are admin-only |

#### Admin Workspace (`/admin`)

| Page or operation | Level | Required server check | Current state |
|---|---|---|---|
| Admin pages (all) | L2 ADMIN, **checked per page** | `isAdmin` on every page and action, not just the layout | 🟠 The layout allows instructors too; no per-page guard (**A-7.1**) |
| Users and roles | L2 ADMIN | Account fields only (name, email, phone, role, status, counts). **No** chats, documents or memory | ✔ Account fields only. ⚠ Visible to instructors today |
| Platform analytics, AI usage | L2 ADMIN | **Aggregate** data (counts, costs, trends), never conversation content | ⛔ Doesn't exist |
| Audit log | L2 ADMIN | Read-only, append-only | ⛔ Doesn't exist (**A-7.2**) |
| Admin Assistant | L2 ADMIN | Read-only, aggregate-level tools; every tool call is audited; no L4 tools | ⛔ Doesn't exist |
| Exceptional access to private data | **L5** | Reason, confirmation, audit entry, narrow scope, time limit | ⛔ Doesn't exist. Must be designed before any L4 data is stored |

### 2.4 Private student conversations and personal data

The Student AI Tutor only works if students feel safe asking "basic" questions. Their conversations, AI memory and personal documents are **L4: owner-private**.

**Teachers**
- Teachers **never** see the content of a student's AI conversations. No page, export, API or Teacher Assistant tool may expose them.
- There is **no** "View chats" item anywhere in the Teacher Workspace: not in the student detail view, the progress table or a dashboard drill-down.
- Teachers may see **coursework** for their own courses: lesson completion, quiz scores, practice results and submitted assignments. Students know this work is submitted for review.
- Possible later additions (each needs a design review and backend support):
  - **Aggregate, anonymised insights**, for example "the most common confusion in Lesson 4 was backpropagation". The rule: never attributable to a student, and suppressed for small classes (for example fewer than 5 students).
  - **Student-initiated sharing**: a student explicitly sends one specific AI answer or question to the teacher ("Ask my teacher"). Only that item is shared, and the student sees exactly what is sent.

**Administrators**
- Admin access is **not** unlimited access. Admins manage **accounts and the platform**, not people's private learning data.
- The Admin Workspace shows account data and aggregates. It has **no browsing of conversations, memory or personal documents**.
- Any access to L4 data is an **L5 exceptional process**: a stated reason, explicit confirmation, the narrowest possible scope, an audit record, and (recommended) notifying the user where the law allows it.
- The Admin Assistant must have **no tool** that reads L4 data.

**AI assistants (all roles)**
- Each assistant reads and writes only within its own **owner and scope** (`ownerUserId` + `assistantScope`, audit Phase 5). Shared infrastructure (provider, quotas, retrieval engine) **never** means shared data.
- Course content (lessons, transcripts) is retrievable by any assistant whose user has L3 access to that course. Personal data is retrievable only by that person's own assistant.
- An assistant's permissions are **never greater** than the permissions of the user it acts for.

### 2.5 Enrollment and ownership boundaries

1. **The student ↔ course boundary is an enrollment.** Everything inside a course (lessons, videos, materials, notes, the tutor, quizzes, practice) needs one. Navigation shows enrolled courses only. The server checks enrollment on each request.
2. **The teacher ↔ course boundary is ownership.** A teacher sees and edits only courses where `course.instructorId` is their instructor record.
3. **The teacher ↔ student boundary goes through the course.** A teacher sees a student **only as an enrollee of the teacher's own course**, and only that course's data.
   - A student enrolled with two teachers appears to each with that teacher's course data only.
   - There is **no** global "All students" page in the Teacher Workspace.
4. **Preview isn't enrollment.** If free preview lessons are added, the "preview" flag must be checked on the server for each lesson, not inferred from position or navigation.
5. **Archiving or unpublishing doesn't silently revoke access.** The behaviour for enrolled students (keep access or lose it) must be an explicit product decision, shown in the confirmation (2.6).
6. **Write paths check the boundary too.** Progress, practice submission, quiz attempts and AI chat must refuse records outside the user's enrollment. They must not create an enrollment as a side effect (**A-7.3**).

### 2.6 Sensitive workflows needing explicit confirmation

Today every delete uses one generic dialog: "This action cannot be undone." (`src/components/admin/row-actions.tsx`). Because of database cascades, several deletes destroy far more than the item named.

**Confirmation standard for the future UI**
- **Standard confirm:** a dialog naming the item and the consequence.
- **Impact confirm:** the dialog **shows counts**, fetched from the server, of what will be removed or affected (for example "12 enrolled students, 340 lesson completions, 85 AI conversations").
- **Typed confirm:** the user types the item's name to enable the action.
- **Re-authentication** (recommended later): enter the password again for privilege changes and L5 access.
- AI assistants may **propose** these actions but never perform them. A human always confirms in the UI.

| Workflow | Who | What it affects (from the schema) | Confirmation |
|---|---|---|---|
| Delete **subject** | Admin | Cascades to **all categories → courses → lessons, enrollments, completions, AI chats, practice submissions, reviews** | Impact + typed |
| Delete **category** | Admin | Cascades to all its courses and everything under them | Impact + typed |
| Delete **course** | Admin, owner teacher | Enrollments, lessons, completions, **students' AI chats**, submissions, reviews, materials | Impact + typed |
| Delete **lesson** | Admin, owner teacher | Content, quiz, exercises, completions, **students' AI chats**, submissions | Impact |
| Delete **user** | Admin | All of their data. **If they're an instructor, the course materials they uploaded are also deleted** (`CourseMaterial.createdBy` cascades) | Impact + typed |
| Change a user's **role** (especially to ADMIN or INSTRUCTOR) | Admin | Grants or removes workspace access | Standard; re-auth later |
| Deactivate an account | Admin | Ends the user's sessions on the next request | Standard |
| Unpublish or archive a course with students | Admin, owner teacher | Students' access (see 2.5.5) | Impact |
| Publish a course | Admin, owner teacher | Makes content visible in the catalog | Standard |
| Remove a student from a course | Owner teacher, admin | The student's access and progress view | Standard |
| Delete an uploaded file | Admin, owner teacher | Any lesson or material that still links to it | Impact (list the places it's used) |
| Bulk invite or enroll students | Owner teacher, admin | Sends messages and creates accounts or enrollments | Standard with a preview of recipients |
| Delete my AI conversations or documents | The student (owner) | Their own private data | Standard |
| Export data (CSV of progress, users) | Admin, owner teacher | Personal data leaves the platform | Standard, recorded in the audit log |
| **Exceptional access to private data (L5)** | Admin | A user's L4 data | Reason + typed + audit; re-auth later |

### 2.7 Navigation decisions that depend on unresolved backend security work

These navigation decisions are **only safe once the matching backend fix exists**. Until then, the interim rule applies. The fixes are planned in audit section 10, Phase 1, unless noted otherwise.

| # | Navigation decision | Depends on (backend) | Audit | Interim rule until fixed |
|---|---|---|---|---|
| D1 | Lesson workspace links shown only for enrolled courses | Enrollment check on the lesson page **and** the lesson context API | A-7.3 | Hiding the links is cosmetic. **Don't publish paid or private content** until it's fixed |
| D2 | AI Tutor panel shown only inside enrolled lessons | Enrollment check and a persistent per-user quota in `/api/era/chat` | A-7.3, A-7.5 | Keep the tutor sign-in only, and watch AI costs |
| D3 | Teacher "Students" page per course | A new course-scoped student query. **Never** `getAdminUsers()` | A-7.1 | Don't build the page on the existing users query |
| D4 | Teacher dashboard activity widget | Activity feed scoped to the teacher's courses | A-7.1 | Leave the activity widget out of the Teacher Workspace |
| D5 | The Admin Workspace hidden from instructors | Per-page `isAdmin` guards on every `/admin` page | A-7.1 | Instructors can still reach `/admin/users` by URL; treat the Teacher/Admin split as unfinished until the guards exist |
| D6 | Materials and video downloads in the lesson workspace | Private bucket plus signed, short-lived read URLs | A-7.4 | Upload only material you'd accept being public |
| D7 | "My documents" and AI memory in the Student Workspace | Private storage plus the `ownerUserId` + `assistantScope` model | A-7.2, A-7.4 (Phase 5) | **Don't add these navigation items** until the backend exists |
| D8 | "Continue where you left off" resume links | Resume lesson validated against the course; no implicit enrollment | A-7.3 | A resume link may point to a lesson outside the course; don't depend on it for access decisions |
| D9 | Teacher Assistant and Admin Assistant entry points | Scope model, tool-level permissions, audit log | A-7.2 (Phase 5) | Don't add the navigation items |
| D10 | Course view counts and "trending" in navigation or homepage rows | Authenticated or deduplicated view tracking without cache revalidation on every view | A-7.5 | Don't use view counts for any ranking that matters |
| D11 | Destructive actions in the Teacher and Admin workspaces | Server-provided impact counts for the confirmation dialogs (2.6) | A-7.6 | Keep the current generic dialog, but don't add bulk-delete UI |
| D12 | An admin using the Teacher Workspace | Workspace-scoped queries (an admin sees only their own courses there) | A-7.1 | Admins manage other teachers' courses only from the Admin Workspace |

### 2.8 Checklist for every new page, action or AI tool

Before merging any UI work, confirm the following:

- [ ] Its access level (L0–L5) is written down, in this document or in the code.
- [ ] The server checks session, role **and** the record relationship (enrollment or ownership). The layout guard alone isn't enough.
- [ ] The query selects only the fields the user may see.
- [ ] IDs from the URL or the request body are checked against the current user.
- [ ] The navigation item uses the same policy function as the server check.
- [ ] No L4 data (AI conversations, memory, personal documents) is reachable by anyone except its owner.
- [ ] Destructive or privilege-changing actions use the right confirmation from 2.6.
- [ ] AI tools act with the permissions of the user, never more, and write actions need human confirmation.
- [ ] If the feature depends on an item in 2.7, the matching backend fix is merged first, or the interim rule is followed.

---

## 3. Complete page hierarchy

Screen IDs (P, S, T, A) are used throughout this document. "Today" is where the closest existing version lives.

### 3.1 Public site (L0)

| ID | Page | Proposed path | Status | Today |
|---|---|---|---|---|
| P1 | Home | `/` | [EXISTS] | `/` |
| P2 | Course catalog | `/courses` | [EXISTS] | `/courses` |
| P3 | Course detail | `/courses/[course]` | [EXISTS] | `/courses/[courseSlug]` |
| P4 | Subjects, Subject detail | `/subjects`, `/subjects/[subject]` | [EXISTS] | same |
| P5 | About, FAQ | `/about`, `/faq` | [EXISTS] | same |
| P6 | Sign up | `/sign-up` | [EXISTS] | same |
| P7 | Sign in | `/sign-in` | [EXISTS] | same |
| P8 | Forgot password | `/forgot-password` | [EXISTS] | same |
| P9 | Learning paths | `/learning-paths` | [EXISTS] (OD-9: hide in v1?) | same |
| P10 | Not found, Access denied, Error | n/a | [PARTIAL] (Not found and Error exist, Access denied doesn't) | `not-found.tsx`, `error.tsx` |

### 3.2 Student Workspace `/learn` (L2 STUDENT)

```
/learn ─────────────────────────── S2  Dashboard ("My Learning")          [PARTIAL]
├── /learn/onboarding ──────────── S1  Onboarding                          [EXISTS at /onboarding]
├── /learn/courses ─────────────── S3  My courses                          [PARTIAL]
│   └── /learn/courses/[course] ── S4  Course home                         [PLANNED]
│       └── …/lessons/[lesson] ─── S5  Lesson workspace (video + ERA Tutor) [PARTIAL]
├── /learn/homework ────────────── S6  Homework list                       [PLANNED · S-ASSIGN]
│   └── /learn/homework/[id] ───── S7  Homework detail and submission      [PLANNED · S-ASSIGN]
├── /learn/results ─────────────── S8  Results and feedback                [PLANNED · S-ASSIGN, S-QUIZ]
├── /learn/conversations ───────── S9  My ERA conversations                [PLANNED · S-AI]
├── /learn/notifications ───────── S10 Notifications                       [PLANNED · S-NOTIFY]
└── /learn/settings ────────────── S11 Profile and settings                [PLANNED]
```

### 3.3 Teacher Workspace `/teacher` (L2 INSTRUCTOR)

```
/teacher ───────────────────────────── T1  Dashboard                         [PARTIAL at /admin]
├── /teacher/courses ───────────────── T2  My courses                        [EXISTS at /admin/courses]
│   ├── /teacher/courses/new ───────── T3  New course (choose method)        [PARTIAL]
│   │   └── …/new/assistant ────────── T4  Create with ERA Assistant         [PLANNED · S-AI]
│   └── /teacher/courses/[course] ──── Course builder:
│       ├── /overview ──────────────── T5  Overview and settings             [EXISTS at /admin/courses]
│       ├── /curriculum ────────────── T6  Curriculum (modules and lessons)  [PARTIAL]
│       │   └── /lessons/[lesson] ──── T7  Lesson editor                     [PARTIAL]
│       ├── /homework ──────────────── T8  Homework list                     [PLANNED · S-ASSIGN]
│       │   └── /[id] ──────────────── T9  Homework editor                   [PLANNED · S-ASSIGN]
│       ├── /submissions ───────────── T10 Submissions review                [PLANNED · S-ASSIGN]
│       ├── /students ──────────────── T11 Students and progress             [PARTIAL at /admin/progress · D3]
│       │   └── /[student] ─────────── T12 Student progress detail           [PLANNED]
│       ├── /announcements ─────────── T13 Announcements                     [PLANNED · S-NOTIFY]
│       └── (dialog) ───────────────── T14 Publish and unpublish             [PARTIAL]
├── /teacher/media ─────────────────── T15 Media library                     [PARTIAL at /admin/materials]
└── /teacher/settings ──────────────── T16 Profile and settings              [EXISTS at /admin/settings]
```

### 3.4 Admin Workspace `/admin` (L2 ADMIN, checked on every page, see D5)

```
/admin ─────────────────────── A1  Platform dashboard                 [PARTIAL]
├── /admin/users ───────────── A2  Users (students, teachers, admins) [EXISTS: list, create, delete]
│   └── /admin/users/[user] ── A3  User detail                        [PLANNED]
├── /admin/teachers ────────── A4  Teacher profiles                   [EXISTS at /admin/instructors]
├── /admin/courses ─────────── A5  All courses                        [EXISTS]
├── /admin/subjects ────────── A6  Subjects and categories            [EXISTS at /admin/subjects, /admin/categories]
├── /admin/analytics ───────── A7  Platform analytics                 [PLANNED]
├── /admin/roles ───────────── A8  Roles and permissions              [PARTIAL]
├── /admin/ai ──────────────── A9  AI usage and quotas                [PLANNED · S-USAGE]
├── /admin/organizations ───── A10 Organizations                      [PLANNED · S-ORG · OD-1]
├── /admin/audit ───────────── A11 Audit log                          [PLANNED · S-AUDIT]
├── /admin/requests ────────── A12 Sensitive operations and requests  [PLANNED · S-AUDIT]
└── /admin/settings ────────── A13 Site settings                      [EXISTS]
```

### 3.5 Legacy route mapping

The old routes keep working until each replacement ships (audit section 9).

| Today | Becomes | Notes |
|---|---|---|
| `/my-learning` | `/learn` | Redirect after S2 ships |
| `/onboarding` | `/learn/onboarding` | |
| `/courses/[c]/lessons/[l]` | `/learn/courses/[c]/lessons/[l]` | The public course page (P3) stays for discovery |
| `/admin/courses`, `/admin/lessons`, `/admin/materials`, `/admin/progress` (for instructors) | `/teacher/...` | Admins keep their own `/admin/courses` (A5) |
| `/admin/instructors` | `/admin/teachers` | Rename only |
| `/admin/categories` | `/admin/subjects` (tab) | Merged into one screen |

---

## 4. Global layout and navigation

### 4.1 Breakpoints

These match the existing Tailwind defaults.

| Name | Width | Layout |
|---|---|---|
| Mobile | < 768 px | One column, bottom tab bar, bottom sheets |
| Tablet | 768–1023 px | One or two columns; navigation collapses to an icon rail |
| Desktop | 1024–1279 px | Sidebar plus content. The assistant panel overlays the content |
| Wide | ≥ 1280 px | Sidebar plus content plus a **docked** assistant panel side by side |

### 4.2 Shells

| Shell | Desktop | Mobile |
|---|---|---|
| **Public** [EXISTS] | Top bar (logo, account actions) plus side drawer menu | Same drawer |
| **Workspace** (Student, Teacher, Admin) [PLANNED] | **Left sidebar** (collapsible to an icon rail) plus a **top bar** (page title, global search, notifications, assistant toggle, account menu) | **Top bar** (title, notifications, account) plus a **bottom tab bar** (Student and Teacher). Admin uses a drawer menu, no tab bar |

**Account menu** (all workspaces): profile, language (English or Uzbek), workspace switcher (only for users with more than one workspace), sign out.

**Workspace switcher.** It is shown only to admins who also own courses (Admin ↔ Teacher). Switching changes **scope**, not just layout (2.1, rule 5). Students and teachers have one workspace.

### 4.3 Navigation items

The visibility rule is UX only; the server checks again on every request (2.1).

**Student sidebar.** Mobile tabs: Home · Courses · Homework · ERA · Me.

| Item | Screen | Visible when | Status |
|---|---|---|---|
| Home | S2 | Always | [PARTIAL] |
| My courses | S3 | Always | [PARTIAL] |
| Homework | S6 | At least one enrolled course has homework | [PLANNED] |
| Results | S8 | Always (shows an empty state when there's nothing) | [PLANNED] |
| ERA conversations | S9 | Always | [BLOCKED: S-AI] |
| Notifications | S10 | Top-bar bell | [PLANNED] |
| Settings | S11 | Account menu | [PLANNED] |

The mobile "ERA" tab opens S9. **Inside a lesson**, the tutor is the bottom sheet (9.10), not the tab.

**Teacher sidebar.** Mobile tabs: Home · Courses · Review · Students · More.

| Item | Screen | Visible when | Status |
|---|---|---|---|
| Home | T1 | Always | [PARTIAL] |
| My courses | T2 | Always | [EXISTS] |
| Review | T10 (all courses) | At least one course has homework | [PLANNED] |
| Students | T11 (course picker first) | Always | [PARTIAL · D3] |
| Media library | T15 | Always | [PARTIAL] |
| Settings | T16 | Account menu | [EXISTS] |

Inside a course, a **secondary navigation** (tabs on desktop, a select menu on mobile) shows: Overview · Curriculum · Homework · Submissions · Students · Announcements.

**Admin sidebar,** grouped:
- **People:** Users, Teachers, Organizations
- **Content:** Courses, Subjects
- **Insights:** Analytics, AI usage
- **Security:** Roles, Audit log, Requests
- **Settings**

### 4.4 Language

Every string exists in **English and Uzbek** [EXISTS pattern]. Uzbek text runs about 20–35% longer, so designs must allow for wrapping in buttons, tabs and table headers. The language switch is in the account menu (workspaces) and the drawer (public).

---

## 5. Screen specifications

Loading, empty, error and permission states follow the standards in **9.11** unless a screen says otherwise.

### 5.1 Public screens

#### P1 Home [EXISTS]
| Field | Specification |
|---|---|
| Purpose | Explain ERA and route visitors to courses or sign-up; route signed-in users to their workspace |
| Primary users | Visitors, prospective students, parents |
| Main content | Hero with platform stats; course rows (continue learning, recommended, trending, new); subjects; instructor credibility; FAQ preview; final call to action |
| Primary actions | Browse courses; Sign up |
| Secondary actions | Open a subject; open FAQ; switch language |
| Entry point | Domain root, logo |
| Required data | Published subjects, courses, instructors, site settings; for signed-in users, their enrollments |
| Permission | L0 |
| Empty state | No published courses: hide the course rows and show "Courses are coming soon" with a sign-up prompt |
| Loading state | Skeleton course cards |
| Error state | Database unavailable: global error page with Try again (current behaviour after the demo-data removal) |
| Notes | "Trending" uses view counts, which aren't reliable (**D10**) |

#### P2 Course catalog [EXISTS]
| Field | Specification |
|---|---|
| Purpose | Find a course |
| Primary users | Visitors, students |
| Main content | Search, filters (subject, difficulty), course cards (title, instructor, level, lesson count, duration, rating) |
| Primary actions | Open a course |
| Secondary actions | Change filters; clear filters |
| Entry point | Navigation "Courses", home rows |
| Required data | Published courses with category, subject, instructor and counts |
| Permission | L0 |
| Empty state | No results: "No courses match these filters" plus Clear filters |
| Loading state | Skeleton cards keeping the grid |
| Error state | Standard |

#### P3 Course detail [EXISTS]
| Field | Specification |
|---|---|
| Purpose | Decide whether to enroll |
| Primary users | Visitors, students |
| Main content | Title, subtitle, description, outcomes, instructor, difficulty, duration; **curriculum with lesson titles only** (no lesson content, 2.3); promo video; reviews |
| Primary actions | **Enroll** (students), **Sign in to enroll** (visitors), **Continue** (already enrolled) |
| Secondary actions | Watch the promo video; read reviews; share |
| Entry point | Catalog, home, subject page |
| Required data | Published course, curriculum titles, review summary; enrollment state for the current user |
| Permission | L0 to view; enroll is L1 + STUDENT |
| Empty state | A course with no lessons: "Lessons are being prepared" and Enroll disabled |
| Loading state | The enrollment button shows a spinner while its state loads |
| Error state | Enrollment failed: inline error beside the button with Retry |
| Notes | Teachers and admins see "Open in Teacher Workspace" instead of Enroll. Curriculum lesson rows must **not** link into lesson content for visitors who aren't enrolled (**D1**) |

#### P6 Sign up [EXISTS]
| Field | Specification |
|---|---|
| Purpose | Create a student account |
| Primary users | New students |
| Main content | Name, email, phone (optional), password, confirm password. [PLANNED] Invite code field (OD-2, S-ACCESS) |
| Primary actions | Create account |
| Secondary actions | Sign in instead; switch language |
| Entry point | Navigation, course detail "Sign in to enroll", home call to action |
| Required data | None |
| Permission | L0; always creates a STUDENT |
| Empty state | n/a |
| Loading state | Button spinner; fields locked while submitting |
| Error state | Inline field errors (duplicate email or phone, weak password, mismatch); a rate-limit message with the wait time |
| Notes | Success shows a confirmation dialog, then continues to onboarding [EXISTS] |

#### P7 Sign in [EXISTS] and P8 Forgot password [EXISTS]
| Field | Specification |
|---|---|
| Purpose | Access an account; reset a forgotten password with an emailed code |
| Main content | P7: email or phone, password. P8: email → 6-digit code → new password |
| Primary actions | Sign in; Send code; Reset password |
| Permission | L0 |
| Error state | Generic "Email or password is incorrect" (never reveal which); inactive account message; rate-limit message |
| Notes | After sign-in, route by role: STUDENT → `/learn`, INSTRUCTOR → `/teacher`, ADMIN → `/admin`, unless a sanitised `next` path is present. [PARTIAL: today admins and instructors always go to `/admin` (a `next` outside `/admin` is ignored); students go to onboarding if it's unfinished, otherwise to `next` or `/my-learning`] |

### 5.2 Student screens

#### S1 Onboarding [EXISTS at `/onboarding`]
| Field | Specification |
|---|---|
| Purpose | Personalise recommendations |
| Primary users | New students |
| Main content | 4 steps with a progress indicator: (1) goal, (2) current level, (3) weekly time, (4) short assessment → personalised plan and recommended course |
| Primary actions | Next; Finish |
| Secondary actions | Back; **Skip for now** [PLANNED: today onboarding is required before My Learning, OD-7] |
| Entry point | After sign-up; banner on S2 while it's incomplete |
| Required data | Draft answers (saved per step [EXISTS]), assessment questions, published courses for the recommendation |
| Permission | L2 STUDENT, own data only |
| Empty state | n/a |
| Loading state | Step transitions keep the layout; "Building your plan…" on finish |
| Error state | The step stays filled in, with an inline error and Retry |
| Notes | Goals are currently hard-coded (AI, Math, English, Exam). A flexible list depends on later schema work (audit section 6, Replace) |

#### S2 Dashboard ("My Learning") [PARTIAL at `/my-learning`]
| Field | Specification |
|---|---|
| Purpose | Show what to do next |
| Primary users | Students |
| Main content | **Continue card** (last course, lesson and video position); my courses with progress; homework due soon [PLANNED]; recent feedback [PLANNED]; study streak and XP [EXISTS, OD-7]; onboarding checklist until it's done [EXISTS] |
| Primary actions | **Continue learning** |
| Secondary actions | Open a course; open homework; browse the catalog |
| Entry point | Sidebar Home, sign-in, logo inside the workspace |
| Required data | Own enrollments, last lesson, [PLANNED] video position (S-VIDEO), homework (S-ASSIGN), feedback, gamification |
| Permission | L2 STUDENT; own data only |
| Empty state | No enrollments: "You haven't started a course yet" plus Browse courses (and an invite code entry if OD-2 = invite) |
| Loading state | Skeleton for the Continue card and the course list |
| Error state | Section-level errors (one failing widget doesn't blank the page) [PARTIAL: today a single `databaseUnavailable` flag] |

#### S3 My courses [PARTIAL]
| Field | Specification |
|---|---|
| Purpose | List enrolled courses |
| Main content | Course cards: thumbnail, title, teacher, progress bar, lessons done/total, next lesson |
| Primary actions | Continue a course |
| Secondary actions | Filter: In progress / Completed; sort by recent |
| Entry point | Sidebar "My courses" |
| Required data | Own enrollments with progress |
| Permission | L2 STUDENT |
| Empty state | Same as S2 |
| Loading state | Skeleton cards |
| Error state | Standard |

#### S4 Course home [PLANNED]
| Field | Specification |
|---|---|
| Purpose | Enrolled view of one course: curriculum, progress, homework, announcements |
| Main content | Header (title, teacher, progress); curriculum by module with lesson status (not started, in progress, done); course homework; announcements [PLANNED · S-NOTIFY]; materials index |
| Primary actions | Continue / Start lesson |
| Secondary actions | Open homework; open a material; leave course (confirm) [PLANNED] |
| Entry point | S3, S2 |
| Required data | Course, modules, lessons, own completions, homework, announcements |
| Permission | **L3 enrollment** (D1) |
| Empty state | No lessons published: "Your teacher is preparing the first lesson" |
| Loading state | Curriculum skeleton |
| Error state | Not enrolled → **Access denied** page with "Enroll" if the course is open, otherwise "Ask your teacher for access" |

#### S5 Lesson workspace [PARTIAL]
**The most important screen.** Today: `/courses/[c]/lessons/[l]` is a long stacked page with video, then the study sidebar, practice and quiz, chat, and notes. The chat sits below the content and has no timestamp awareness.

| Field | Specification |
|---|---|
| Purpose | Watch, read, practise and ask, without leaving the lesson |
| Primary users | Students |
| Main content | See the layout below |
| Primary actions | Play the video; **Ask ERA**; Mark complete [EXISTS, manual] / auto-complete at the watched threshold [PLANNED · S-VIDEO] |
| Secondary actions | Previous and next lesson [EXISTS]; open the curriculum; download materials [EXISTS]; run practice [EXISTS]; answer the quiz [PLANNED · S-QUIZ]; change playback speed; captions [PLANNED · S-TRANSCRIPT] |
| Entry point | S2 Continue, S4 curriculum, the next-lesson button |
| Required data | Lesson, course and curriculum, video source, lesson content (notes, objectives, key points), materials, quiz questions **without answers** [EXISTS, uncommitted], practice exercises **without solutions** [EXISTS, uncommitted], own completion, own video position [PLANNED], own ERA conversation for this lesson [EXISTS] |
| Permission | **L3 enrollment**, or teacher ownership (preview mode) [BLOCKED: D1, D2] |
| Empty state | No video: the notes become the main panel. No notes: "Notes for this lesson aren't available yet." No exercises: practice tab hidden |
| Loading state | Video placeholder at 16:9 (no layout shift); content tabs as skeletons; the tutor panel loads independently |
| Error state | Video fails: a message plus "Try again" plus a link to report it. Tutor fails: error inside the panel only; the lesson keeps working |

**Layout, Wide (≥ 1280 px)**
```
┌────────────┬───────────────────────────────────────────┬────────────────────┐
│ Curriculum │  Video (16:9)                             │  ERA Tutor         │
│ (collaps-  │  ───────────────────────────────────────  │  (docked, 380 px,  │
│  ible)     │  Tabs: Notes · Materials · Practice ·     │   collapsible to   │
│            │        Quiz · Transcript                  │   a 56 px rail)    │
│            │  Tab content                              │                    │
│            │  ───────────────────────────────────────  │                    │
│            │  ◄ Previous   Mark complete   Next ►      │                    │
└────────────┴───────────────────────────────────────────┴────────────────────┘
```
- **Desktop (1024–1279 px):** the curriculum is a drawer opened by a button. The tutor is an **overlay** right panel, 380 px, that doesn't shrink the video.
- **Tablet:** the video is full width, the curriculum is a drawer, and the tutor is a right overlay panel (or a bottom sheet in portrait).
- **Mobile:** the video is **sticky at the top** while scrolling the tabs. The tutor is the **bottom sheet** (9.10), opened by a floating "Ask ERA" button above the tab bar. In half-height mode the sheet sits **below the sticky video**, so the student can watch and read the answer together.
- **Persistence:** the tutor's open or collapsed state is remembered per device (a UI preference, not an access decision).
- **Video behaviour when asking:** see OD-6. Recommended default: **don't pause**. "Ask about this moment" (9.10) captures the timestamp, and the student can pause manually.

#### S6 Homework list [PLANNED · S-ASSIGN]
| Field | Specification |
|---|---|
| Purpose | See all homework across enrolled courses |
| Main content | Grouped: **Due soon**, **Upcoming**, **Submitted (awaiting review)**, **Reviewed**, **Overdue**. Each row: title, course, due date, status, points |
| Primary actions | Open homework |
| Secondary actions | Filter by course or status |
| Entry point | Sidebar Homework, S2 "Due soon", notifications |
| Required data | Homework for own enrollments, own submission status |
| Permission | L2 STUDENT; only homework from enrolled courses |
| Empty state | "No homework right now" |
| Loading state | List skeleton |
| Error state | Standard |

#### S7 Homework detail and submission [PLANNED · S-ASSIGN]
| Field | Specification |
|---|---|
| Purpose | Read the task, submit work, see feedback |
| Main content | Instructions, linked lesson, due date, points, submission area (by type: text answer with math formula support, file upload, quiz, coding exercise), submission history; after review: grade and feedback |
| Primary actions | **Submit** (with confirmation if late or final) |
| Secondary actions | Save draft (autosave); open the linked lesson; **Ask ERA about this task** (OD-8: the tutor may explain concepts but must not write graded answers) |
| Entry point | S6, S4, notification |
| Required data | Homework, own submissions, feedback |
| Permission | L3 enrollment; own submission only |
| Empty state | n/a |
| Loading state | Upload progress per file; submit button spinner |
| Error state | Upload failed (per file, Retry); past the deadline when late submissions aren't allowed: "Submissions closed" |

#### S8 Results and feedback [PLANNED · S-ASSIGN, S-QUIZ]
| Field | Specification |
|---|---|
| Purpose | One place for grades, quiz scores and teacher feedback |
| Main content | Per course: homework grades, quiz scores, practice results [EXISTS data], teacher feedback with dates |
| Primary actions | Open the feedback item |
| Secondary actions | Filter by course |
| Entry point | Sidebar Results, "Feedback received" notification |
| Permission | L2 STUDENT; own only |
| Empty state | "Your results will appear here after your first quiz or homework" |
| Loading state | List skeleton |
| Error state | Standard |

#### S9 My ERA conversations [PLANNED · BLOCKED: S-AI]
| Field | Specification |
|---|---|
| Purpose | Find, continue or delete past tutor conversations |
| Main content | Conversations grouped by course and lesson, with a search box. Each shows the lesson, the date and the first question |
| Primary actions | Open (goes back into S5 with the panel open) |
| Secondary actions | Delete a conversation; delete all (confirm, 2.6) |
| Entry point | Sidebar, mobile ERA tab, tutor panel "History" |
| Required data | Own conversations only (L4) |
| Permission | **L4 owner** |
| Empty state | "Ask ERA a question in any lesson. Your conversations will appear here" |
| Loading state | List skeleton |
| Error state | Standard |
| Notes | Today, history exists per lesson inside the lesson chat only [EXISTS]. A privacy note on screen: "Only you can see these conversations. Your teacher can't." (2.4) |

#### S10 Notifications [PLANNED · S-NOTIFY]
| Field | Specification |
|---|---|
| Purpose | Homework assigned or due, feedback received, announcements |
| Main content | List, newest first; unread dot; grouped Today / Earlier |
| Primary actions | Open the related item |
| Secondary actions | Mark all as read |
| Entry point | Top-bar bell (with an unread count) |
| Permission | L2; own only |
| Empty state | "You're all caught up" |
| Loading state | List skeleton in the dropdown or page |
| Error state | Bell hidden on error; the page shows the standard error |

#### S11 Profile and settings [PLANNED]
| Field | Specification |
|---|---|
| Purpose | Manage own account |
| Main content | Name, email, phone, password change, language, notification preferences, ERA tutor preferences (pause video when asking, OD-6), privacy: download my data / delete my ERA conversations / request account deletion |
| Primary actions | Save |
| Secondary actions | Change password; request deletion (confirm, 2.6) |
| Entry point | Account menu |
| Permission | L1; own only |
| Error state | Inline field errors |
| Notes | Staff already have a profile and password form in `/admin/settings` [EXISTS]. Students have no settings page today |

### 5.3 Teacher screens

#### T1 Teacher dashboard [PARTIAL at `/admin`]
| Field | Specification |
|---|---|
| Purpose | See what needs attention across own courses |
| Main content | **Needs attention**: submissions to review, students at risk (inactive 7+ days or low progress); own course cards with enrolled count and average progress; recent activity **in own courses only** |
| Primary actions | Review submissions; open a course |
| Secondary actions | Create course; open ERA Assistant |
| Entry point | Sign-in, sidebar Home |
| Required data | Own courses, their enrollments and progress, pending submissions |
| Permission | L2 INSTRUCTOR; every widget scoped to own courses |
| Empty state | No courses: "Create your first course" with **Create manually** and **Create with ERA Assistant** |
| Loading state | Widget skeletons, loaded independently |
| Error state | Widget-level error with Retry |
| Notes | Today `/admin` shows scoped counts but a **platform-wide activity feed** (**D4**). Leave out the activity widget until it's fixed |

#### T2 My courses [EXISTS at `/admin/courses`]
| Field | Specification |
|---|---|
| Purpose | List and manage own courses |
| Main content | Table on desktop / cards on mobile: title, status (Draft, Published, Archived), subject, level, lessons, enrolled students, last edited |
| Primary actions | **New course**; open a course |
| Secondary actions | Search; filter by status; duplicate [PLANNED]; delete (impact confirm, 2.6) |
| Entry point | Sidebar |
| Required data | Own courses only |
| Permission | L2; list scoped to ownership [PARTIAL: the list isn't consistently scoped] |
| Empty state | Same as T1 |
| Loading state | Table skeleton rows |
| Error state | Standard |

#### T3 New course: choose a method [PARTIAL]
| Field | Specification |
|---|---|
| Purpose | Pick between manual creation and ERA Assistant |
| Main content | Two large options: **Start from scratch** (opens T5 with an empty draft) and **Create with ERA Assistant** (T4) |
| Primary actions | Choose an option |
| Entry point | T2 "New course", T1 empty state |
| Permission | L2 INSTRUCTOR |
| Notes | Today, a create form at the top of `/admin/courses` [EXISTS]. The ERA option shows "Coming soon" until S-AI exists |

#### T4 Create with ERA Assistant [PLANNED · BLOCKED: S-AI, S-USAGE]
See journey **6B**.

| Field | Specification |
|---|---|
| Purpose | Turn a brief and the teacher's materials into a **draft** course outline and lesson drafts |
| Main content | Step 1 brief → Step 2 outline review → Step 3 lesson drafts → Step 4 save as draft |
| Primary actions | Generate outline; accept; **Save as draft course** |
| Secondary actions | Regenerate an item; edit inline; remove an item; upload source materials |
| Required data | The teacher's own inputs and uploads only |
| Permission | L2 INSTRUCTOR plus AI quota |
| Empty state | Step 1 form |
| Loading state | Streaming outline with per-item placeholders; "ERA is drafting lesson 3 of 8" |
| Error state | Generation failed: keep everything so far, Retry the failed item; quota reached: the wait time and "Continue manually" |
| Notes | Nothing is published automatically. All generated items are labelled **AI draft** until the teacher edits or approves them |

#### T5 Course builder: Overview and settings [EXISTS at `/admin/courses` edit form]
| Field | Specification |
|---|---|
| Purpose | Course details and settings |
| Main content | Title, subtitle, short description, description, subject and category, difficulty, outcomes (one per line), thumbnail upload, promo video upload or URL, status [EXISTS]; enrollment access mode [PLANNED · OD-2, S-ACCESS] |
| Primary actions | Save |
| Secondary actions | Preview as a student; **Publish / Unpublish** (T14); delete course (impact + typed confirm) |
| Entry point | T2 → course → Overview tab |
| Required data | Own course |
| Permission | **L3 ownership** [EXISTS, enforced on save] |
| Empty state | New draft: blank form with hints |
| Loading state | Form skeleton; saving shows "Saving…" then "Saved" |
| Error state | Inline field errors; save failed: banner, edits kept |
| Notes | The "Instructor" field appears for admins only [EXISTS behaviour] |

#### T6 Course builder: Curriculum [PARTIAL]
| Field | Specification |
|---|---|
| Purpose | Structure the course into modules and lessons |
| Main content | Modules as collapsible groups, lessons inside them with status (Draft or Published), video ✓, notes ✓, quiz ✓, and exercises ✓ indicators |
| Primary actions | **Add lesson**; **Add module** [PLANNED: the module model exists, the UI doesn't] |
| Secondary actions | Drag to reorder (keyboard alternative: Move up / Move down) [PLANNED: today a numeric order field]; rename; delete (impact confirm) |
| Entry point | Course tabs |
| Required data | Own course modules and lessons |
| Permission | L3 ownership |
| Empty state | "Add your first lesson" with an illustration |
| Loading state | List skeleton |
| Error state | Reorder failed: revert the order and show a toast |
| Notes | Today lessons are always created **Published** [EXISTS]. Planned: new lessons start as Draft |

#### T7 Lesson editor [PARTIAL]
| Field | Specification |
|---|---|
| Purpose | Author everything a student sees in S5 |
| Main content | Tabs: **Basics** (title, description, duration [EXISTS]); **Video** (upload or URL [EXISTS], transcript [PLANNED · S-TRANSCRIPT]); **Content** (rich text notes with headings, images, math formula blocks, code blocks; objectives; key points [PLANNED UI, the data model exists]); **Materials** (attach files [EXISTS via `/admin/materials`]); **Quiz** (questions, options, correct answer, explanation [PLANNED UI, the model exists]); **Practice** (coding exercises [PLANNED UI, the model exists]) |
| Primary actions | Save; Publish lesson |
| Secondary actions | Preview as a student; **Ask ERA Assistant** (draft notes, quiz questions or a summary from this lesson's content or transcript) [PLANNED · S-AI]; create homework from this lesson (6D) |
| Entry point | T6 |
| Required data | Own lesson and its content |
| Permission | L3 ownership |
| Empty state | Each tab has its own "Add …" prompt |
| Loading state | Tab skeletons; upload progress bars |
| Error state | Unsaved changes warning on leave; per-tab save errors |

#### T8 Homework list [PLANNED · S-ASSIGN]
| Field | Specification |
|---|---|
| Purpose | Manage a course's homework |
| Main content | Title, linked lesson, due date, status (Draft, Assigned, Closed), submitted count / enrolled, reviewed count |
| Primary actions | New homework |
| Secondary actions | Open; duplicate; close; delete (impact confirm) |
| Permission | L3 ownership |
| Empty state | "No homework yet. Create homework from any lesson." |

#### T9 Homework editor [PLANNED · S-ASSIGN]
| Field | Specification |
|---|---|
| Purpose | Create or edit one homework item |
| Main content | Title; linked lesson; type (written answer, file upload, quiz, coding, OD-8); instructions (rich text with formulas); points; due date and time (with time zone shown); late policy; who it's assigned to (all enrolled; cohorts later · S-ACCESS) |
| Primary actions | Save draft; **Assign** (confirm with the number of students) |
| Secondary actions | Ask ERA Assistant to draft instructions or questions from the lesson |
| Permission | L3 ownership |
| Error state | Validation: due date in the past, missing type |

#### T10 Submissions review [PLANNED · S-ASSIGN]
| Field | Specification |
|---|---|
| Purpose | Grade and give feedback |
| Main content | **Queue** (left): filter by homework and status (Not reviewed, Reviewed, Late); **Submission** (centre): student name, submitted time, answer, files with preview, code with automatic test results; **Grading** (right): points, feedback text, return |
| Primary actions | **Return to student** |
| Secondary actions | Save grade without returning; next / previous submission; **Suggest feedback** with ERA Assistant (draft only; the teacher edits; the assistant sees this submission and the homework, never the student's ERA conversations) |
| Entry point | T1 "Needs attention", sidebar Review, T8 |
| Required data | Submissions for own course only |
| Permission | L3 ownership |
| Empty state | "No submissions to review" |
| Loading state | Submission panel skeleton; file previews load lazily |
| Error state | File preview failed: show a download link instead |
| Notes | Practice submissions are stored today but have no teacher view [PARTIAL data] |

#### T11 Students and progress (per course) [PARTIAL at `/admin/progress` · D3]
| Field | Specification |
|---|---|
| Purpose | Course-specific class overview |
| Main content | Roster table: name, (email: OD-3), progress %, lessons done, last active, quiz average [PLANNED], homework submitted / assigned [PLANNED], at-risk flag [PLANNED] |
| Primary actions | Open a student (T12) |
| Secondary actions | Search; sort; filter (at risk, completed, not started); export CSV (confirm, audited, 2.6) [PLANNED]; remove a student (confirm) [PLANNED] |
| Entry point | Course tab "Students", sidebar Students (course picker first) |
| Required data | **Only enrollments in this course**, and only the fields listed |
| Permission | L3 ownership; **never** built on the platform users query (D3) |
| Empty state | "No students yet. Share the course or invite students." (OD-2) |
| Loading state | Table skeleton |
| Error state | Standard |
| Notes | Today `/admin/progress` lists student, course, instructor, completed, progress and updated, scoped to the instructor's courses [EXISTS] |

#### T12 Student progress detail (course-scoped) [PLANNED]
| Field | Specification |
|---|---|
| Purpose | Help one student in one course |
| Main content | Lesson-by-lesson completion; video watched % [PLANNED · S-VIDEO]; quiz scores; homework with grades; practice results; last active |
| Primary actions | Open a submission (T10) |
| Secondary actions | Message the student [PLANNED · S-NOTIFY] |
| Permission | L3 ownership, this course only |
| Notes | **No ERA conversations, no AI memory, no data from other courses** (2.4, 2.5). The page says: "ERA conversations are private to the student." |

#### T13 Announcements [PLANNED · S-NOTIFY]
| Field | Specification |
|---|---|
| Purpose | Message everyone enrolled in a course |
| Main content | List of announcements; composer (title, body) |
| Primary actions | Post (confirm with the number of recipients) |
| Secondary actions | Edit, delete |
| Permission | L3 ownership |
| Empty state | "No announcements yet" |

#### T14 Publish and unpublish (dialog) [PARTIAL]
See journey **6G**.

| Field | Specification |
|---|---|
| Purpose | Make a course visible or hidden safely |
| Main content | Publish: a **pre-publish checklist** (title, description, thumbnail, at least one published lesson, every published lesson has a video or notes, quiz questions have correct answers). Unpublish or archive: **impact** (enrolled students, homework in progress) and the access consequence (OD-4) |
| Primary actions | Publish / Unpublish / Archive |
| Permission | L3 ownership |
| Notes | Today, a Status select on the course form, with no checklist and no confirmation [EXISTS] |

#### T15 Media library [PARTIAL at `/admin/materials`]
| Field | Specification |
|---|---|
| Purpose | Manage uploaded files across own courses |
| Main content | Grid or list: file name, type icon or preview, size, course and lesson, "used in" count, uploaded date |
| Primary actions | Upload (drag and drop; PDF, Word, PowerPoint, Excel, images, ZIP up to 25 MB; video up to 500 MB [EXISTS limits]) |
| Secondary actions | Attach to a lesson; rename; delete (impact confirm listing where it's used) |
| Permission | L3 ownership; own uploads |
| Empty state | "Upload slides, PDFs and images to use in your lessons" |
| Loading state | Per-file upload progress |
| Error state | Type or size rejected (inline, with the limit); upload failed (Retry) |
| Notes | Files are **publicly readable** today (**D6**). The design should include an "Only enrolled students can open this" label once S-STORAGE exists, and must not show it before then |

#### T16 Profile and settings [EXISTS at `/admin/settings`]
Own profile (name, email, phone), password, language, ERA Assistant preferences [PLANNED]. Permission: L1, own only.

### 5.4 Admin screens

All admin screens: L2 ADMIN **checked on every page** (D5). Desktop-first. On mobile they are read-only, except urgent account actions (deactivate).

#### A1 Platform dashboard [PARTIAL]
| Field | Specification |
|---|---|
| Purpose | Platform health at a glance |
| Main content | Counts: students, teachers, courses, enrollments [EXISTS]; active learners this week; AI usage today versus quota [PLANNED · S-USAGE]; pending requests (A12) [PLANNED]; recent administrative activity [EXISTS as a general feed] |
| Primary actions | Open the pending requests |
| Secondary actions | Jump to Users, Courses, Analytics |
| Permission | L2 ADMIN; **aggregates only** |
| Empty state | A new platform: setup checklist (create a subject, invite a teacher, publish a course) |

#### A2 Users [EXISTS: list, create, delete]
| Field | Specification |
|---|---|
| Purpose | Find and manage accounts |
| Main content | Table: name, email, phone, role, status, enrollments, created date [EXISTS columns]; tabs: All / Students / Teachers / Admins |
| Primary actions | **Create user** [EXISTS: name, email, phone, password, role] |
| Secondary actions | Search [PLANNED]; filter by role and status [PLANNED]; open user (A3) [PLANNED]; delete (impact + typed confirm) [PARTIAL: generic confirm today] |
| Permission | L2 ADMIN. **Account fields only** (2.3) |
| Empty state | n/a (at least the admin exists) |
| Notes | Today instructors can open this page by URL (**D5**, A-7.1) |

#### A3 User detail [PLANNED]
| Field | Specification |
|---|---|
| Purpose | Manage one account |
| Main content | Profile fields; role; status (Active, Deactivated); enrollments (course and progress); for teachers: owned courses; account events (sign-ins, role changes) [PLANNED · S-AUDIT] |
| Primary actions | Edit; **Change role** (confirm); **Deactivate / Reactivate** (confirm) |
| Secondary actions | Send a password reset link; delete (impact + typed); data export (audited) |
| Permission | L2 ADMIN. **No ERA conversations, memory or documents.** The page states: "Private learning data isn't visible to admins. For legal or safety requests, use Requests (A12)." |

#### A4 Teacher profiles [EXISTS at `/admin/instructors`]
Public profile (name, slug, title, bio, photo, email) used on course pages. Primary action: create. Secondary: delete [EXISTS]; link to a user account [PARTIAL: today linked automatically by matching email; planned: an explicit "Linked account" picker]. Permission: L2 ADMIN.

#### A5 All courses [EXISTS]
Table: title, teacher, subject, level, lessons, status, enrolled. Actions: open in a **read-and-administer view** (change status, reassign teacher, delete with impact + typed confirm). Admins edit course content only from here, not by entering another teacher's Teacher Workspace (D12).

#### A6 Subjects and categories [EXISTS]
Tree: subjects with their categories; create, rename, reorder, delete. **Deleting a subject or category cascades to every course under it** (2.6), so it needs impact + typed confirmation. Recommendation for the design: offer **Archive** as the primary action and keep Delete secondary.

#### A7 Platform analytics [PLANNED]
| Field | Specification |
|---|---|
| Purpose | Understand learning across the platform |
| Main content | Date-range picker; enrollments over time; active learners (daily and weekly); completion rates per course; homework submission rates; AI tutor usage (questions per day, per course) |
| Primary actions | Change range; export CSV (audited) |
| Permission | L2 ADMIN; **aggregates only**. Never individual conversation content. Small groups (fewer than 5) are suppressed |
| Empty state | "Not enough data for this period yet" |

#### A8 Roles and permissions [PARTIAL]
| Field | Specification |
|---|---|
| Purpose | See what each role can do, and change a user's role |
| Main content | A **read-only matrix** of the three fixed roles (Student, Teacher, Admin) against capabilities, generated from the policy definitions (2.2); a list of users per role with Change role |
| Primary actions | Change a user's role (confirm, 2.6) |
| Notes | Roles are fixed in code. Custom roles are out of scope (OD-13). Today the role is chosen only when creating a user; there's no change-role UI |

#### A9 AI usage and quotas [PLANNED · BLOCKED: S-USAGE]
| Field | Specification |
|---|---|
| Purpose | Control AI cost and fairness |
| Main content | Usage today and this month (requests, tokens, estimated cost) by assistant type and by course; quota settings: per-student daily limit, per-teacher daily limit, platform monthly cap; top users **by volume only** (no message content) |
| Primary actions | Save quotas (confirm) |
| Secondary actions | Temporarily raise a user's quota (audited) |
| Permission | L2 ADMIN; metadata only |
| Empty state | "No AI usage recorded yet" |

#### A10 Organizations [PLANNED · BLOCKED: S-ORG · OD-1]
| Field | Specification |
|---|---|
| Purpose | Manage the schools or learning centres that use ERA |
| Main content | List: name, teachers, students, courses, status; detail: members and their roles inside the organization, courses owned |
| Primary actions | Create organization; add members |
| Permission | L2 ADMIN (platform level). Organization-level admins: OD-1 |
| Notes | ERA has **no organization concept today**. It's single-tenant. Until OD-1 is decided, design this as a hidden section, and design the workspace switcher so an organization name could be added later |

#### A11 Audit log [PLANNED · BLOCKED: S-AUDIT]
Append-only, read-only list: time, actor, action (role change, deletion, export, quota change, L5 access), target, reason. Filters: actor, action type, date. No edit or delete actions exist on this screen.

#### A12 Sensitive operations and requests [PLANNED · BLOCKED: S-AUDIT]
| Field | Specification |
|---|---|
| Purpose | Handle deletion requests, data exports and exceptional (L5) access in a controlled way |
| Main content | Queue: type (account deletion, data export, L5 access), requester, date, status (Open, Approved, Done, Rejected) |
| Primary actions | Process the request through its workflow (journey 8G) |
| Permission | L2 ADMIN; every step is audited |
| Empty state | "No open requests" |

#### A13 Site settings [EXISTS]
Platform name, support email, default promo video, description [EXISTS]. Admin only.

---

## 6. Teacher journeys

Each journey shows **Today** (what works now) and **Target** (the planned experience).

### 6A. Create a course manually
**Status:** [PARTIAL]

**Today**
1. Go to `/admin/courses` and fill in the create form: title, subtitle, short description, description, category, difficulty, outcomes, thumbnail, promo video, status. (Admins also pick the instructor.)
2. Go to `/admin/lessons`, pick the course, and add lessons one at a time: title, description, video URL or upload, duration, order. Each lesson is published immediately.
3. Go to `/admin/materials` and attach files to the course or lesson.
4. Lesson notes, objectives, quizzes and exercises **can't be added**; they come from seed scripts only.

**Target**
| # | Step | Screen |
|---|---|---|
| 1 | Teacher clicks **New course** → **Start from scratch** | T2 → T3 |
| 2 | Fills in the overview. The course is saved as **Draft** automatically | T5 |
| 3 | Opens Curriculum, adds modules and lessons | T6 |
| 4 | Opens each lesson: video, content (notes, formulas, images), materials, quiz, practice | T7 |
| 5 | Previews as a student | S5 preview mode |
| 6 | Publishes through the checklist | T14 (6G) |

**Edge cases:** leaving with unsaved changes (warn); duplicate title (the slug is generated automatically [EXISTS]); upload failure (retry per file).
**Dependencies:** module and content UI (no schema change); draft lessons (no schema change, the status field exists).

### 6B. Create a course with ERA Assistant
**Status:** [PLANNED · BLOCKED: S-AI, S-USAGE; source uploads also need S-STORAGE]

| # | Step | Screen | Rules |
|---|---|---|---|
| 1 | **New course** → **Create with ERA Assistant** | T3 → T4 | Shows the remaining AI quota |
| 2 | **Brief:** topic, target students (age or level), language (English or Uzbek), number of lessons, lesson length, learning goals; optional source materials (own PDFs or slides) | T4 step 1 | Only files the teacher uploads now, or their own media library |
| 3 | ERA streams a **proposed outline**: modules → lessons → 2–4 objectives each | T4 step 2 | Shown as AI draft |
| 4 | Teacher edits: rename, reorder, delete, "Regenerate this module", add their own items | T4 step 2 | Every change is the teacher's decision |
| 5 | Teacher chooses which lessons get **draft notes** and **draft quiz questions** | T4 step 3 | Generation per lesson, with progress shown |
| 6 | **Save as draft course** creates the course, modules and lessons, all **Draft** | T4 step 4 → T6 | Nothing is published; no students can see it |
| 7 | Teacher reviews each lesson in the editor; the AI-draft label is removed on edit or "Mark reviewed" | T7 | |
| 8 | Teacher adds videos and publishes | T7 → T14 | Normal publishing rules (6G) |

**Failure handling:** a failed generation keeps everything produced so far, with Retry on the failed item. When the quota runs out, show the reset time and "Continue manually"; all drafts are kept.
**Boundaries:** ERA Assistant sees the brief, the teacher's own uploaded sources, and the draft so far. It does **not** see other teachers' courses or any student data (10.1).

### 6C. Upload a lesson with text, images, PDFs or slides
**Status:** [PARTIAL]

**Today:** video by URL or upload [EXISTS]. Files (PDF, Word, PowerPoint, Excel, images, ZIP up to 25 MB) attach as **Downloads** [EXISTS]. Text notes and inline images **aren't editable** in the UI.

**Target (T7):**
| # | Step | Detail |
|---|---|---|
| 1 | Open the lesson → **Content** tab | |
| 2 | Write notes in a rich-text editor | Headings, lists, **inline images** (upload or paste), **math formula blocks** (LaTeX with a live preview), code blocks, callouts |
| 3 | **Materials** tab: drag in PDFs or slides | Each file shows a preview thumbnail. PDFs and slides can be viewed in the browser in S5 [PLANNED] as well as downloaded |
| 4 | Set objectives and key points | One per line |
| 5 | Save → preview as a student | |

**Dependencies:** **D6.** Files are publicly readable until S-STORAGE exists. Until then, show the teacher a notice: "Files you upload can be opened by anyone with the link." In-browser slide viewing for PowerPoint may need conversion to PDF (a technical decision for later).

### 6D. Create homework from an existing lesson
**Status:** [PLANNED · BLOCKED: S-ASSIGN; notifications S-NOTIFY]

| # | Step | Screen |
|---|---|---|
| 1 | In the lesson editor: **Create homework from this lesson** (or T8 → New → pick a lesson) | T7 / T8 |
| 2 | Choose the type: written answer, file upload, quiz (reuse or extend the lesson quiz), coding exercise (reuse lesson practice) | T9 |
| 3 | Instructions are pre-filled with the lesson title and objectives. Optional: **Ask ERA Assistant** to draft questions from the lesson content | T9 |
| 4 | Set points, due date and time, late policy | T9 |
| 5 | **Assign** → confirm: "Assign to 24 enrolled students?" | T9 dialog |
| 6 | Students are notified; the homework appears in S6 and S4 | S10 |

**Edge cases:** an unpublished lesson can't have assigned homework (assigning is disabled with an explanation); editing after submissions exist warns the teacher.

### 6E. Review student submissions
**Status:** [PLANNED · BLOCKED: S-ASSIGN]. Practice submissions are stored today but have no teacher view.

| # | Step | Screen |
|---|---|---|
| 1 | Open **Needs attention** or **Review** | T1 / T10 |
| 2 | Filter the queue: course, homework, Not reviewed | T10 |
| 3 | Open a submission: answer, files (preview), code with automatic test results, submitted time, Late badge | T10 |
| 4 | Enter points and written feedback. Optional **Suggest feedback** (ERA drafts; the teacher edits) | T10 |
| 5 | **Return to student**, then the next submission opens automatically | T10 |
| 6 | The student is notified | S10, S8 |

**Rules:** grading is always a human action; there is no bulk "grade all". ERA Assistant sees **only this submission and the homework**, never the student's tutor conversations.

### 6F. View course-specific student progress
**Status:** [PARTIAL]. `/admin/progress` today: student, course, instructor, lessons completed, progress %, updated, scoped to own courses.

| # | Step | Screen |
|---|---|---|
| 1 | Course → **Students** tab | T11 |
| 2 | Sort or filter: at risk, not started, completed | T11 |
| 3 | Open a student: lesson completion, watched %, quiz, homework, practice **for this course only** | T12 |
| 4 | Optional: message the student or open a submission | T12 |

**Dependencies:** D3 (a course-scoped query only); watched % needs S-VIDEO; quiz needs S-QUIZ; homework needs S-ASSIGN.
**Privacy:** no ERA conversations (2.4); student email visibility is OD-3.

### 6G. Publish and unpublish a course
**Status:** [PARTIAL]. Today the course form has a Status select (Draft, Published, Archived). Saving applies it immediately, without a checklist or confirmation. A course that isn't published is hidden from the catalog, and its lessons stop opening.

**Target:**
| # | Step |
|---|---|
| 1 | Teacher clicks **Publish** (T5 header or T2 row menu) |
| 2 | The checklist dialog (T14) shows ✓ or ✗ for each requirement. Failing items link to where they can be fixed |
| 3 | When everything passes → **Publish course** → toast "Course published" with **View as student** |
| 4 | **Unpublish**: the dialog shows "24 students are enrolled. They will [lose access / keep access] (OD-4)." → confirm |
| 5 | **Archive**: same as unpublish, plus the course is removed from the teacher's active list |

---

## 7. Student journeys

### 7A. Sign up and onboarding
**Status:** [EXISTS]. Skip and invite code are [PLANNED].

| # | Step | Today | Target |
|---|---|---|---|
| 1 | Open Sign up from the navigation or a course page | P6 [EXISTS] | Same |
| 2 | Enter name, email, optional phone, password ×2 | [EXISTS] | Plus an optional invite code (OD-2) |
| 3 | Account created, signed in, success dialog | [EXISTS] | Same |
| 4 | Onboarding: goal → level → weekly time → short assessment → plan | S1 [EXISTS], **required** before My Learning | **Skippable**; S2 shows a reminder banner |
| 5 | Land on the dashboard with the recommended course | S2 | Same, plus "Enroll in recommended course" |

### 7B. Enroll in a course
**Status:** [EXISTS] for open self-enrollment. Other access modes are [PLANNED · OD-2, S-ACCESS].

| # | Step | Screen |
|---|---|---|
| 1 | Open a course from the catalog or home | P2 → P3 |
| 2 | Signed out: **Sign in to enroll** → back to P3 after sign-in [EXISTS] | P7 |
| 3 | **Enroll** → button changes to **Start course** [EXISTS: "Add to My Learning"] | P3 |
| 4 | Target: lands on Course home | S4 |

Invite mode (planned): enter the code in S2 or P6 → enrolled directly.

### 7C. Open My Learning
**Status:** [PARTIAL]. `/my-learning` shows enrollments with resume links, XP, streak, badges, analytics and the onboarding checklist.

Target flow: sign in → `/learn` (S2) → **Continue** card → S5 at the saved place. Homework due and recent feedback appear when S-ASSIGN exists.

### 7D. Watch a video lesson
**Status:** [PARTIAL]. YouTube, Vimeo and uploaded files play [EXISTS]. Position, captions and auto-complete are [PLANNED].

| # | Step | Detail |
|---|---|---|
| 1 | Open the lesson | S5. The video loads in a fixed 16:9 frame |
| 2 | Play. Controls: play/pause, seek, speed (0.75–2×), captions [S-TRANSCRIPT], fullscreen, **Ask about this moment** | Keyboard: Space or K play/pause, ←/→ seek 5 s, F fullscreen, C captions, **A ask ERA** |
| 3 | Position saved every 10 seconds and on pause or leaving [S-VIDEO] | |
| 4 | At 90% watched, the lesson is marked complete automatically (manual marking stays available) [S-VIDEO] | Toast: "Lesson complete" with **Next lesson** |
| 5 | At the end: "Up next: …" card with a 5-second countdown, cancellable | |

**Dependencies:** OD-5 (hosting); embedded YouTube and Vimeo need their player APIs for position events.

### 7E. Ask ERA Tutor without leaving the lesson
**Status:** [PARTIAL]. A chat panel exists on the lesson page today, below the content, sign-in required, 8 questions per minute.

| # | Step | Desktop | Mobile |
|---|---|---|---|
| 1 | Open the tutor | Click **Ask ERA** in the top bar or the rail, or press **A** | Tap the floating **Ask ERA** button |
| 2 | Panel opens | Docked right sidebar (wide) or overlay (desktop); the video keeps playing (OD-6) | Bottom sheet at **half height**, below the sticky video |
| 3 | Context chips show what ERA can see: "Lesson 3: Neural networks", "Notes" | Same | Same |
| 4 | Type a question → **Send** (Enter; Shift+Enter for a new line) | | |
| 5 | The answer **streams** in [PLANNED; today it arrives all at once]. Stop button while it's generating | | Sheet can be dragged to full height |
| 6 | Answers render formulas, code and **clickable timestamps** that seek the video | | Tapping a timestamp collapses the sheet to peek height and seeks |
| 7 | Collapse the panel; the conversation is kept | Rail with an unread dot | Sheet closes; the button shows a dot |

**States:** thinking, streaming, error (Retry), rate-limited ("Wait 40 seconds"), daily quota reached [S-USAGE], offline, not enrolled (D2).

### 7F. Ask about a formula, notation or a video timestamp
**Status:** [PLANNED]. Transcript-aware answers need S-TRANSCRIPT.

Four entry points add a **context chip** to the composer. The student can remove a chip before sending.

| Entry point | Action | Chip |
|---|---|---|
| Video | **Ask about this moment** button, or **A** while playing | ⏱ 04:32 |
| Notes or transcript | Select text → floating **Ask ERA** button | “ŷ = σ(Wx + b)” (quoted, up to 500 characters) |
| Formula block | **Explain** button on each formula block in the notes | ∑ Formula 2 |
| Material (PDF page) | **Ask about this page** in the viewer [PLANNED] | 📄 Slides p. 7 |

**Server behaviour:**
- The client sends only the lesson ID, the timestamp or the selected text.
- The server checks enrollment and loads the transcript around that time (±60 s) and the relevant notes (10.2).
- **Before transcripts exist**, the tutor gets the timestamp and the notes only. It must say so: "I can't see the video itself. Here's an explanation based on the lesson notes."

### 7G. Complete homework
**Status:** [PLANNED · BLOCKED: S-ASSIGN]

| # | Step | Screen |
|---|---|---|
| 1 | A notification or "Due soon" on the dashboard → open the homework | S10 / S2 → S7 |
| 2 | Read the instructions; open the linked lesson if needed (returns to the homework afterwards) | S7 → S5 |
| 3 | Answer: text (with a formula editor), file upload, quiz, or code (with test runs) | S7 |
| 4 | Drafts autosave ("Saved 10:42") | S7 |
| 5 | **Submit** → confirm ("You can't edit after submitting" if resubmission isn't allowed) | S7 dialog |
| 6 | Status becomes **Submitted, awaiting review** | S7, S6 |

**ERA Tutor and homework:** the tutor may explain concepts and lesson material, but it must not produce the graded answer (OD-8). The panel shows: "ERA can help you understand, not do the homework for you."

### 7H. Receive feedback
**Status:** [PARTIAL]. Practice exercises give instant automatic results [EXISTS]. Teacher feedback is [PLANNED · S-ASSIGN, S-NOTIFY].

1. A notification arrives: "Feedback on Homework 2". The bell and S2 show it.
2. Open S7: grade, teacher comment, and the teacher's notes on the answer.
3. Optional: **Ask ERA to explain this feedback**. The tutor receives the feedback text only because the student explicitly attached it (10.2).
4. Results history in S8.

### 7I. Continue from the last video position
**Status:** [PARTIAL]. Today the last opened **lesson** is remembered and My Learning links to it. The video position isn't saved.

| # | Step | Detail |
|---|---|---|
| 1 | The dashboard Continue card shows "Lesson 4 · 12:40 of 18:05" with a progress bar | S2 [S-VIDEO] |
| 2 | **Continue** opens S5 | |
| 3 | The player shows **Resume from 12:40** / **Start over** (auto-resumes after 3 seconds) | |
| 4 | Works across devices (saved on the server, not in the browser) | |

**Dependency:** D8 (the resume lesson must be validated against the course).

---

## 8. Admin journeys

### 8A. Manage teachers and students
**Status:** [PARTIAL]

**Today:** `/admin/users` lists all users and lets an admin create one (name, email, phone, password, role) or delete one. There's no edit, deactivate or search. `/admin/instructors` creates or deletes public teacher profiles, which link to a user account automatically by matching email.

**Target:**
| # | Step | Screen |
|---|---|---|
| 1 | Users → tab Students or Teachers → search | A2 |
| 2 | Open a user → see account details, enrollments, owned courses | A3 |
| 3 | Edit details / send a reset link / deactivate (confirm) | A3 |
| 4 | Make someone a teacher: change role → create or link the teacher profile (explicit linking) | A3 → A4 |
| 5 | Invite teachers in bulk (preview list, confirm) [PLANNED · S-ACCESS] | A2 |

### 8B. Manage courses and subjects
**Status:** [EXISTS]. Archive-first and impact confirmations are [PLANNED].

1. Subjects (A6): create, rename and reorder subjects and categories [EXISTS]. Prefer **Archive** to Delete.
2. Courses (A5): filter by teacher or status; change status; reassign teacher; delete with impact + typed confirmation.
3. Admins edit another teacher's course content from A5, not from the Teacher Workspace (D12).

### 8C. Review platform analytics
**Status:** [PARTIAL]. Dashboard counts [EXISTS]; the analytics screen is [PLANNED].

A1 → **View analytics** → A7: pick a date range, compare courses, export CSV (audited). Aggregate only; small groups are suppressed.

### 8D. Manage roles and permissions
**Status:** [PARTIAL]. Roles are fixed (Student, Teacher, Admin); a role is set only when the user is created.

1. A8 shows the capability matrix (read-only).
2. Change a user's role from A3 or A8 → confirm: "Make Aziz an Admin? Admins can manage all users and courses." Re-authentication is recommended later.
3. The change takes effect on the user's next request [EXISTS behaviour: the role is re-read from the database]. It's recorded in the audit log [S-AUDIT].
4. **Guardrail:** the last remaining admin can't be demoted or deleted.

### 8E. Review AI usage and quotas
**Status:** [PLANNED · BLOCKED: S-USAGE]

1. A9 shows usage today and this month, by assistant and by course, with estimated cost.
2. Adjust quotas (per-student daily, per-teacher daily, monthly cap) → confirm → audited.
3. When the platform reaches 80% of the monthly cap, admins get a warning notification. At 100%, assistants show "ERA is unavailable until …" to users.
4. **No message content** is shown anywhere in this journey.

### 8F. Manage organizations
**Status:** [PLANNED · BLOCKED: S-ORG, OD-1]. ERA is single-tenant today.

If OD-1 is accepted (an organization = a school or learning centre):
1. A10 → **Create organization** (name, contact).
2. Add teachers and students as members; set organization admins (if allowed).
3. Courses belong to an organization; the teachers and students of one organization don't see another's.

Until then, designers should leave room for an organization name in the workspace switcher and the account menu, but show nothing.

### 8G. Handle sensitive account and deletion operations
**Status:** [PARTIAL]. Delete with a generic confirmation [EXISTS]. Workflows and auditing are [PLANNED · S-AUDIT].

| Operation | Flow |
|---|---|
| **Delete a user** | A3 → Delete → impact dialog (enrollments, submissions, owned courses, **and materials they uploaded**, 2.6) → type the name → confirm → audited. Blocked if the user owns published courses: reassign them first |
| **Student requests account deletion** | S11 → request → A12 queue → admin reviews → the impact dialog → done → the student is notified by email |
| **Data export request** | S11 → request → A12 → export generated → download link sent to the student → audited |
| **Exceptional (L5) access** | A12 → New L5 request → reason (required) + scope (one user, one data type) + time limit → typed confirmation → access granted read-only for the time limit → audited; user notified where the law allows |
| **Deactivate an account** | A3 → Deactivate → confirm → the user is signed out on the next request [EXISTS behaviour] |

---

## 9. Shared interaction patterns

### 9.1 Global navigation
- The left sidebar shows the active item highlighted. Collapsing it keeps icons with tooltips, and the collapsed state is remembered.
- Mobile tab bar: 5 items at most, icon plus label (never icon only), a 48 px minimum touch target, hidden while the keyboard is open.
- Breadcrumbs inside a course: Course › Module › Lesson (desktop only).
- Always provide a visible "Skip to content" link.

### 9.2 Search
- **Global search** (top bar, `/` or Ctrl+K): searches what the user can access. Students: own courses, lessons, homework. Teachers: own courses, lessons, students in own courses. Admins: users, courses. Results grouped by type and **filtered on the server** (2.1).
- **Page search**: an input above the table or list, debounced at 300 ms, with the search term kept in the URL.
- No results: "No results for 'xyz'" plus a suggestion to clear the filters.

### 9.3 Filters
- Desktop: a filter bar above the table with select chips. Mobile: a **Filters** button that opens a bottom sheet, with Apply and Reset.
- Active filters show as removable chips plus "Clear all". Filters are kept in the URL, so they survive a reload and can be shared.

### 9.4 Tables
- Desktop: a sticky header, sortable columns (indicated by an arrow), row hover, a row menu (⋯) for secondary actions, and pagination with 25 rows per page.
- **Mobile: tables become cards** showing the 3–4 most important fields and a ⋯ menu.
- Checkbox bulk selection only where a bulk action is safe (never bulk delete, D11).
- Empty table: the empty state replaces the table body, with the header kept.

### 9.5 Forms
- Labels above the fields; required fields marked; help text below; errors inline below the field, in red with an icon and text (never colour alone).
- Validate on blur and on submit; focus moves to the first error.
- Long editors (T5, T7, T9, S7) **autosave** drafts with a "Saving… / Saved 10:42" indicator. Short forms save explicitly.
- Warn about unsaved changes when leaving.
- Submit buttons show a spinner and are disabled during submission [EXISTS pattern].

### 9.6 Drawers
- **Right drawer** (desktop, 480 px) for quick view or edit without leaving a list: user summary, material details, submission preview.
- On mobile, drawers become **full-screen sheets** with a back arrow.
- The **assistant panel is not a drawer**. It has its own pattern (9.10), so it can stay open next to other drawers.
- Esc closes; focus returns to the trigger.

### 9.7 Dialogs
- Used only for decisions and confirmations, never for long forms.
- Title as a question ("Delete this lesson?"), body with the consequence, the primary action on the right and **named after the action** ("Delete lesson", not "OK").
- Focus is trapped; Esc and Cancel close it [EXISTS: Radix dialog].
- Mobile: a bottom-aligned dialog with full-width buttons.

### 9.8 Notifications
| Type | Use | Behaviour |
|---|---|---|
| **Toast** | Confirm a completed action ("Saved", "Course published") | Bottom-right on desktop, top on mobile; 5 s; an Undo action where possible; `aria-live="polite"` |
| **Inline banner** | A page-level state (offline, quota nearly used, unpublished course preview) | Stays until resolved or dismissed |
| **Notification centre** | Events for the user (homework, feedback, announcements) [S-NOTIFY] | Bell with unread count → dropdown (desktop) or page (mobile) |
| **Email** | Password reset [EXISTS]; later: feedback received, homework due (opt-out in S11) | |

### 9.9 Confirmation workflows
These implement 2.6.

| Level | UI |
|---|---|
| Standard | Dialog: question, consequence, named action |
| Impact | Dialog with **counts loaded from the server** before the action button is enabled (shows a spinner while loading) |
| Typed | Impact dialog plus "Type **Neural Networks 101** to confirm"; the button is enabled only on an exact match |
| Re-authentication [PLANNED] | Password prompt inside the dialog |

Destructive buttons use the danger style and are never the default focus.

### 9.10 Assistant entry points and panel
This one pattern is used by **all three assistants**.

| Element | Specification |
|---|---|
| Entry points | Top-bar button (sparkle icon + "Ask ERA" / "ERA Assistant" / "Assistant"); keyboard **A** inside lessons (when focus isn't in a text field); contextual buttons ("Ask about this moment", "Explain", "Suggest feedback", "Draft with ERA") |
| Desktop panel | Right side, **380 px** (resizable 320–480 px). **Docked** at ≥ 1280 px (content narrows), **overlay** at 1024–1279 px. Collapses to a **56 px rail** with the assistant icon and an unread dot |
| Mobile panel | **Bottom sheet** with three heights: **peek** (input only, about 15%), **half** (about 50%, below the sticky video in lessons), **full** (about 92%). Drag handle **plus** a visible close button and expand button (dragging is never the only way) |
| Header | Assistant name, **context chips** ("ERA can see: Lesson 3 · Notes · 04:32"), New conversation, History, Collapse |
| Body | Messages; formulas and code rendered; timestamps clickable; Copy on each answer; feedback 👍/👎 [PLANNED] |
| Composer | Multi-line input, attached-context chips (removable), Send, **Stop** while generating; character limit 3,000 [EXISTS] |
| States | Idle; thinking ("ERA is thinking…"); streaming; error with Retry; rate-limited with a countdown [EXISTS 8/min]; daily quota reached [S-USAGE]; offline; not enrolled / not permitted; provider unavailable [EXISTS message] |
| Accessibility | `role="complementary"` with a label; streamed answers announced through `aria-live="polite"` (once per message, not per word); the mobile sheet at full height traps focus; Esc collapses; focus returns to the trigger; respects `prefers-reduced-motion` |
| Privacy line | Under the composer: Student "Only you can see this conversation"; Teacher "ERA Assistant uses only your courses"; Admin "Aggregate data only" |

### 9.11 Standard page states
| State | Pattern |
|---|---|
| **Loading** | Skeletons matching the final layout (no layout shift); a spinner only inside buttons; content in independent sections loads independently [EXISTS: `loading.tsx` per area] |
| **Empty** | Illustration or icon, one sentence explaining why it's empty, one primary action [EXISTS: `empty-state` component] |
| **Error** | Section-level when possible ("Couldn't load homework" plus Retry); full-page only when the whole page fails [EXISTS: `error.tsx`] |
| **Access denied (403)** | "You don't have access to this page" plus the most useful next step (Enroll, Ask your teacher, Go to your dashboard) [PLANNED] |
| **Not found (404)** | Also used for records the user mustn't know exist (2.1) [EXISTS: `not-found.tsx`] |
| **Offline** | Top banner "You're offline. Changes will be saved when you reconnect"; disable actions that need the server |

### 9.12 Accessibility baseline
- WCAG 2.2 AA. Text contrast at least 4.5:1; focus rings always visible; touch targets at least 44 px.
- Full keyboard use, with no keyboard traps outside modal sheets and dialogs.
- Video: captions (S-TRANSCRIPT); a transcript tab; keyboard shortcuts listed in a "?" help dialog.
- Formulas: accessible math rendering (screen-reader readable), not images.
- Respect reduced-motion and the text size the user sets.

---

## 10. Assistant context boundaries

**Rule for all assistants:** the client sends **only** the page type, record IDs and short-lived UI context (timestamp, selected text, explicitly attached items). **The server** checks permissions (section 2) and loads the data. Nothing the client sends grants access. Context chips (9.10) show the user what the assistant can see.

### 10.1 Teacher: ERA Assistant [PLANNED · S-AI]
| Context | Allowed? | Condition |
|---|---|---|
| Current course (title, description, settings) | ✔ | Teacher owns it (L3) |
| Current module and its lessons | ✔ | Owned course |
| Current lesson (notes, objectives, quiz, exercises, transcript) | ✔ | Owned course |
| Teacher's own uploaded materials | ✔ | Uploaded by this teacher, or attached to an owned course |
| Aggregate class statistics (completion %, quiz averages, common wrong answers) | ✔ | Owned course; groups smaller than 5 suppressed |
| One student's submission | ✔ | **Only** while grading that submission in T10 |
| Teacher's own earlier ERA Assistant conversations | ✔ | Owner (L4) |
| Other teachers' courses or materials | ✘ | |
| **Any student's ERA Tutor conversations or AI memory** | ✘ | **Never** (2.4) |
| Student emails, phones, data from other courses | ✘ | |
| Platform-wide statistics | ✘ | |

**Actions:** the assistant may **draft** (outline, notes, quiz, homework, feedback). Saving creates drafts only. Publishing, assigning and returning grades are always the teacher's own action (2.6).

### 10.2 Student: ERA Tutor [PARTIAL · full version needs S-AI, S-TRANSCRIPT]
| Context | Allowed? | Condition | Today |
|---|---|---|---|
| Current course (title) | ✔ | Enrolled (L3) | [EXISTS, without the enrollment check: D2] |
| Current lesson (title, description, notes, objectives, key points) | ✔ | Enrolled | [EXISTS] |
| Current video timestamp | ✔ | Sent by the player; used to pick the transcript window | [PLANNED] |
| Transcript around the timestamp (±60 s) | ✔ | Enrolled | [PLANNED · S-TRANSCRIPT] |
| Relevant lesson materials (text of attached PDFs or slides) | ✔ | Enrolled; materials of **this** lesson | [PLANNED · S-STORAGE, S-AI] |
| Selected text or formula | ✔ | Explicitly attached by the student | [PLANNED] |
| The student's own conversation for this lesson | ✔ | Owner (L4) | [EXISTS: last 6 messages] |
| The student's own memory (preferences, recurring difficulties) | ✔ | Owner; can be viewed and deleted in S11 | [PLANNED · S-AI] |
| The student's own feedback or homework | ✔ | **Only when the student attaches it** | [PLANNED] |
| **Quiz correct answers, practice solutions, homework answer keys** | ✘ | Kept on the server so the tutor can't reveal them | [EXISTS for the page; the tutor rule is PLANNED] |
| Other students' data, teacher-only notes, unpublished lessons | ✘ | | |
| Lessons from courses the student isn't enrolled in | ✘ | | [BLOCKED: D2] |

### 10.3 Admin: Admin Assistant [PLANNED · S-AI, S-AUDIT]
| Context | Allowed? | Condition |
|---|---|---|
| The current management page (which screen, filters) | ✔ | Admin |
| Aggregate statistics (counts, rates, AI usage totals) | ✔ | Groups smaller than 5 suppressed |
| Account-management data (name, email, role, status, enrollment counts) | ✔ | On user pages (A2, A3); every lookup audited |
| Course metadata (title, teacher, status, counts) | ✔ | |
| The admin's own earlier Admin Assistant conversations | ✔ | Owner |
| **Any user's AI conversations, memory or personal documents** | ✘ | Only through the L5 process, **never through the assistant** |
| Lesson content in bulk, student coursework details | ✘ | Not needed for administration |

**Actions:** read-only. The assistant can **suggest** an action (for example "Deactivate this account?"), but it opens the normal confirmation UI; it never acts by itself.

---

## 11. Open product decisions

Each has a recommended default, so designers can proceed without guessing. Decisions change the screens noted.

| # | Decision | Recommended default | Affects |
|---|---|---|---|
| OD-1 | What is an **organization**? | A school or learning centre that owns teachers, students and courses. **Not in v1**: ERA stays single-tenant | A10, 8F, workspace switcher |
| OD-2 | How do students get **access** to a course? | Per course: **Open** (self-enroll) or **Invite code**; teacher-assigned later | P3, P6, S2, T5, T11 |
| OD-3 | Can teachers see a student's **email**? | Yes, for students enrolled in their own course; phone number never | T11, T12 |
| OD-4 | What happens to enrolled students when a course is **unpublished**? | They **keep access**; new enrollment stops. Archive removes access after a warning | T14, 6G |
| OD-5 | **Video hosting** | Bunny Stream (protected streaming); YouTube unlisted as the fallback | S5, T7, 7D |
| OD-6 | Does opening ERA **pause the video**? | No. A per-student setting in S11 can turn auto-pause on | S5, 7E |
| OD-7 | Show **XP, streaks, badges** and require onboarding in v1? | Hide gamification; onboarding becomes optional | S1, S2 |
| OD-8 | **Homework types** in v1, and the tutor's role in homework | Written answer and file upload first; quiz and coding next. The tutor explains but doesn't write graded answers | S7, T9, 7G |
| OD-9 | Keep **learning paths** in v1? | Hide them until there are several courses | P9, S2 |
| OD-10 | **Retention** of ERA conversations | Kept until the student deletes them or the account is deleted | S9, S11, 8G |
| OD-11 | **Payments** | Out of scope for v1 | P3 |
| OD-12 | **AI quotas** | Students: 50 tutor messages a day; teachers: 100 assistant requests a day; adjustable in A9 | 9.10, A9 |
| OD-13 | **Custom roles** | No. Three fixed roles | A8 |
| OD-14 | Can a student **resubmit** homework? | Yes, until the due date, unless the teacher turns it off | S7, T9 |

---

## 12. Dependency register

Planned features and what they're waiting for. "Backend fix" items are Phase 1 work in the audit and need no schema change. S-codes need schema or infrastructure work, which is a separate phase.

| Code | What's needed | Unlocks | Screens |
|---|---|---|---|
| D1, D2 | Enrollment checks on lessons, lesson context and the tutor | Gated lesson workspace and tutor | S4, S5, 7D–7F |
| D3, D4, D5 | Instructor-scoped queries and per-page admin guards | Teacher Students page, dashboard activity, Teacher/Admin split | T1, T11, A1–A13 |
| D6 | Private storage (see S-STORAGE) | "Only enrolled students" file access | T15, S5 materials |
| D8 | Validated resume lesson, no implicit enrollment | Reliable Continue | S2, 7I |
| D10 | Reliable view tracking | Trending rows | P1 |
| D11 | Impact counts from the server | Impact confirmations | All destructive dialogs |
| D12 | Workspace-scoped queries for admins | Admin in the Teacher Workspace | Workspace switcher |
| S-ASSIGN | Homework, submissions, grades, feedback | Homework and review | S6–S8, T8–T10, 6D, 6E, 7G, 7H |
| S-QUIZ | Quiz attempts | Interactive quizzes and scores | S5 quiz, S8, T11, T12 |
| S-VIDEO | Video position and watched % | Resume at a position, auto-complete | S2, S5, T12, 7D, 7I |
| S-TRANSCRIPT | Timestamped transcripts | Captions, transcript tab, timestamp-aware tutor | S5, T7, 7F |
| S-AI | Assistants, conversations, memory, documents with owner and scope | All three assistants beyond today's lesson chat | S9, T4, 10.1–10.3 |
| S-USAGE | AI usage and quotas | Quota UI, cost control | A9, 9.10 states |
| S-ORG | Organizations | Multi-school | A10, 8F |
| S-ACCESS | Invites, cohorts, per-course access mode | Invite codes, assigned enrollment | P6, S2, T5, T9, T11 |
| S-NOTIFY | Notifications and announcements | Bell, announcements, homework alerts | S10, T13 |
| S-AUDIT | Security audit log | Audit log, requests, audited exports | A3, A11, A12, 8D, 8G |
| S-STORAGE | Private buckets and signed read links | Protected materials, personal documents | T15, S5, S9, 6C |

**Ready to build now (no blocker):** shells and navigation (section 4); the module, lesson-content, quiz and practice editors (T6, T7); the pre-publish checklist (T14); course-scoped progress UI over existing data (T11, after D3); optional onboarding (S1).


## Navigation update: Students (Student Management & Payments)

- **Admin → Students:** Student management (`/admin/students`), Payments, Exams & schedule, Teacher permissions.
- **Teacher → Students:** My students (`/teacher/my-students`), Payments (only with permission), Exams & schedule. The earlier teacher "Students" page is now called **Progress**.
- **Student → My courses:** a new "Enrollments & payments" section.

See `docs/ERA_STUDENT_MANAGEMENT.md`.
