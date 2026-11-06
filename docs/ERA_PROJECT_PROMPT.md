# ERA Academy: Project Context and Working Prompt

> Paste this file at the start of a new AI coding session, or hand it to a developer, to continue the work without re-auditing.
> Update the **Status** and **Next steps** sections after each session.

---

## 1. Role and goal

You are a senior full-stack engineer working on **ERA Academy**, a Next.js EdTech platform.

**Owner's goal:** launch my own **AI video course** for my students first, then add more courses later. The platform must be safe, simple to run alone, and cheap at the start.

**Working rules**
- Read the code before changing it, and match the existing style (TypeScript, Tailwind, server functions in `src/server/`, Prisma).
- Make small, focused commits on the `phase-1-foundation` branch. Never commit `.env`.
- Verify every change by running `npx tsc --noEmit -p .` and `npx next lint`, and test in the running app where possible.
- Say plainly what was verified and what was not.
- All UI text exists in **English and Uzbek** (`locale === "uz"`). Keep both.

---

## 2. Tech stack

| Area | Choice |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 3, shadcn-style UI primitives in `src/components/ui/` |
| Database | PostgreSQL through Prisma 6 (`prisma/schema.prisma`) |
| Hosting target | Vercel |
| File storage | Supabase Storage (signed uploads, `src/app/api/admin/storage/`) |
| Auth | Custom HMAC-signed session cookie plus bcrypt (`src/lib/auth.ts`) |
| AI tutor ("ERA") | Ollama or OpenAI-compatible provider (`src/lib/era/provider.ts`) |
| i18n | English and Uzbek (`src/lib/i18n.ts`) |

**Data model:** Subject → Category → Course → CourseModule → Lesson. A lesson has LessonContent, quiz questions, practice exercises, materials and chat messages. Users have enrollments, lesson completions, XP, streaks and badges.

**Key folders**
- `src/app/(public)/`: public site, courses, lesson pages, sign-in and sign-up, My Learning
- `src/app/admin/`: admin and instructor studio (`actions.ts` holds the server actions)
- `src/app/api/`: API routes (enroll, progress, ERA chat, practice, uploads)
- `src/server/`: server-side data functions
- `src/lib/`: shared helpers (auth, permissions, storage, rate limiting, i18n)

---

## 3. Audit summary (Nov 2026)

### Critical issues
1. **Database is gone.** The old Supabase project returns "tenant not found". A new project is needed.
2. **Lessons are not locked.** Anyone, even signed out, can open any lesson, watch its video and download its materials. Enrollment only bookmarks a course.
3. **Videos are in a public bucket.** Uploaded files get permanent public URLs, so they're easy to download and share. Raw MP4 is also slow on mobile.
4. **The practice lab ran student code on the server** with Node `vm`, which is not a sandbox and could expose the database and storage keys. *(Fixed, not yet committed. See section 4.)*
5. **Solutions were sent to the browser** (`solutionCode`). *(Fixed, not yet committed.)*
6. **Hard-coded admin password** in `prisma/seed.ts` (`EraAdmin2026!`).
7. **Work was uncommitted, inside OneDrive.** OneDrive corrupts the `.next` build cache. *(Work is now committed; the project still needs to move out of OneDrive.)*

### Missing features for the AI course
- An admin course builder: there are no editors for modules, lesson notes, quizzes or exercises (they exist only in seed scripts).
- Interactive quizzes: currently questions are shown, with no answering or scoring.
- Video progress tracking: resume position, and auto-complete at about 90% watched.
- Access control for students: invite codes or admin-assigned enrollment.
- A lesson transcript field so the AI tutor knows what the video says.
- A hosted AI provider with a per-student daily limit. The Ollama default won't run on Vercel.
- Certificates (the FAQ promises them), a teacher progress dashboard, announcements.
- Persistent rate limiting. The current in-memory version doesn't work across Vercel instances.
- Automated tests (none exist).

### Not needed now (hide or remove)
- XP, streaks, badges, learning paths, public reviews and view counters. Hide them until there are enough students.
- Forced onboarding before My Learning. Make it optional.
- Hard-coded subjects (`LearningGoal` enum: AI, Math, English, Exam). These block adding new course topics.
- Two chatbots that overlap. Keep the lesson tutor.

### Already solid
- Signed sessions with timing-safe comparison, bcrypt (cost 12), safe redirect handling.
- Admin guard, instructor ownership checks, upload type and size validation.
- A database schema that scales to multiple courses, SEO, and a polished mobile-friendly design.

---

## 4. Decisions made

| Topic | Decision |
|---|---|
| Database | **Supabase.** Free plan while building ($0), then **Pro at $25/month on the day real students start**, because the free plan pauses after 7 days of inactivity. |
| Why Supabase | The app already uses Supabase Storage, so no rewrite is needed. It's standard Postgres through Prisma, so it's easy to migrate later. |
| Cost estimate | About 1.5 MB per student per year, so 1,000 students ≈ 1.5 GB. Storage is not the cost driver. |
| Video hosting | **Not decided yet.** Options: Bunny Stream (~$5–15/month, protected, recommended) or unlisted YouTube (free, easy to share). Never store videos in the database or the Supabase free tier. |
| Student access | **Not decided yet.** Options: free with invite codes, or paid. |
| Practice code | Runs in a **browser Web Worker**, never on the server. The server only transpiles (TypeScript/Python → JavaScript). Results are self-reported by the browser, which is acceptable for practice. |

---

## 5. Status: work completed

Branch: **`phase-1-foundation`** (not merged to `main`, not pushed)

| Commit | What it did |
|---|---|
| `bc82c09` | Snapshot of all previously uncommitted work (restore point). Added `tsconfig.tsbuildinfo` to `.gitignore`. |
| `446d2b5` | **Task 1, cleanup.** Removed root screenshots, `icons/`, `README_IMPROVEMENTS.md` (already merged into `Daily_Improvements.md`), the Lighthouse script and the `lighthouse` and `chrome-launcher` packages. Deleted about 1 GB of ignored clutter: `.npm-cache`, `.next-build-backup`, `.tmp`, logs, `auth-cookies.txt`. |
| `0584df6` | **Task 4, demo-data fallback removed.** Deleted `src/lib/demo-data.ts` (580 lines) and `src/lib/public-home.ts`. Removed `withDatabaseFallback` and replaced its 24 call sites with direct queries. Removed the fake "Learner momentum" homepage card. The sitemap now lists static pages only if the database is unreachable. Net change: about −1,600 lines. |

### Uncommitted: tasks 7 and 8 (code complete, needs final verification)

**Task 7: practice code runs in the browser**
- `src/server/practice.ts`: removed `node:vm` execution. Added `compilePracticeCode()` (transpile only) and `MAX_PRACTICE_CODE_LENGTH` (20,000). `submitPracticeExercise()` now takes browser results and validates them against the database's test cases (count must match; descriptions and expected values come from the database).
- `src/app/api/practice/compile/route.ts` (new): sign-in required, rate limited to 30 per minute, returns the transpiled script.
- `src/app/api/practice/[exerciseId]/submit/route.ts`: accepts and validates `results`.
- `src/lib/practice-runner.ts` (new): a Blob Web Worker with a 2-second timeout (terminated after), network APIs removed along the whole prototype chain (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts`, `indexedDB`, `caches`), and per-test error capture.
- `src/components/courses/practice-lab.tsx`: compile → run in worker → submit.

**Task 8: answers stay on the server**
- `src/server/practice-variants.ts` (new): the per-language starter and solution table moved here from the client-imported `src/lib/practice-languages.ts`.
- `src/server/lessons.ts`: lesson page data now sends `starterCodeByLanguage` and `testCases`, and no longer sends `solutionCode` or `solutionNotes`. The quiz query no longer selects `correctOption` or `explanation`.
- The solution unlocks only after the student runs the checks at least once (the server returns it in the submit response).

**Verification done**
- `tsc --noEmit` passes.
- Scripted check: all six seeded solutions (two exercises × Python, JavaScript and TypeScript) pass and all starters fail. A throwing test is reported as failed, network APIs are removed, and a missing export gives a clear message.

**Still to verify before committing**
- `next build` failed once with `next/font` error "Cannot read properties of null (reading '1')" while downloading Google Fonts. It looks unrelated to these changes, since Google Fonts is reachable. Rerun the build to confirm.
- After the build, search `.next/static` for `helps turn patterns`, which is solution text. Expect no matches.
- Test in a real browser once the database exists: run checks, infinite-loop timeout, solution unlock.

---

## 6. Next steps (in order)

### Phase 1: foundation (finish first)
- [ ] Verify and commit tasks 7 and 8 (see above).
- [ ] Move the project out of OneDrive (for example `C:\dev\ERA`).
- [ ] **Owner:** create a new Supabase project (Frankfurt region), put `DATABASE_URL` (pooler, port 6543) and the direct URL (port 5432) in `.env`.
- [ ] Run `npx prisma db push`, then write a clean seed: a real admin with the password taken from an env var, plus one empty AI course. Remove the fake subjects and instructors.
- [ ] **Task 5:** lock lesson pages, materials and the AI tutor to signed-in, enrolled students.
- [ ] **Task 6:** student access through invite codes or admin-assigned enrollment.

### Phase 2: the AI video course
- [ ] Video hosting setup and a protected player (after the owner decides).
- [ ] Admin course builder: modules and lessons, with reordering.
- [ ] Lesson editor: notes, objectives, key points, materials.
- [ ] Quiz builder and interactive quizzes, graded on the server.
- [ ] Video progress: resume position and auto-complete at about 90%.
- [ ] Transcript field per lesson, fed to the AI tutor.
- [ ] Hosted AI provider with a per-student daily limit.
- [ ] Teacher dashboard: student progress, quiz scores, last active.

### Phase 3: polish
- [ ] Optional onboarding, hide gamification, announcements, completion certificate (PDF), email notifications.

### Phase 4: growth
- [ ] Flexible subjects (replace the `LearningGoal` enum), multiple instructors, payments (Payme or Click for Uzbekistan, or Stripe), automated tests, persistent rate limiting.

---

## 7. Open questions for the owner
1. Video hosting: **Bunny Stream** or **unlisted YouTube**?
2. Student access: **free with invite codes** or **paid**?
3. Expected student count and total video hours (for cost planning of video and AI)?

---

## 8. Useful commands

```bash
npm run dev                 # start locally (http://localhost:3000)
npx tsc --noEmit -p .       # type check
npx next lint               # lint
npx prisma db push          # create or update tables in the database
npm run db:seed             # seed data
rm -rf .next                # fix "EINVAL readlink .next/..." errors (OneDrive cache corruption)
```
