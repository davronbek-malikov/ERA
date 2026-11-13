# ERA Academy

Production-ready EdTech platform scaffold built with Next.js App Router, TypeScript, Tailwind CSS, Prisma ORM, and PostgreSQL.

## Stack

- Next.js 15 App Router
- TypeScript
- Tailwind CSS
- shadcn-compatible UI primitives
- Prisma ORM
- PostgreSQL
- Vercel deployment target

## Features

- Public learning catalog for subjects and courses
- Dynamic subject and course detail pages
- Admin CMS routes for subjects, categories, courses, lessons, instructors, users, and settings
- Lesson pages with an ERA AI assistant for per-lesson Q&A
- Per-user lesson chat history stored in the database
- Prisma seed data for local development
- SEO metadata, OpenGraph images, robots, and sitemap support
- Loading states, empty states, not-found handling, and global error boundary

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

```bash
DATABASE_URL=""
NEXT_PUBLIC_APP_URL=""
AUTH_SECRET=""
NODE_ENV="development"
SUPABASE_URL=""
SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""
ERA_LLM_PROVIDER=""
ERA_API_KEY=""
OLLAMA_BASE_URL=""
ERA_MODEL_NAME=""
```

ERA security rules in this repo:

- secrets are read on the server only
- no API keys are exposed to the browser
- no secrets should be committed to GitHub
- use local `.env` files or your deployment secret manager for real values

For production on Vercel:

- `DATABASE_URL`: your Supabase Postgres connection string
- `NEXT_PUBLIC_APP_URL`: your production domain, for example `https://your-app.vercel.app`
- `AUTH_SECRET`: a long random secret for signed sessions
- `ERA_LLM_PROVIDER`: `ollama` or `openai`
- `OLLAMA_BASE_URL`: required when using Ollama
- `ERA_MODEL_NAME`: the model name to call, for example `qwen2.5:7b` or `gpt-4.1-mini`
- `ERA_API_KEY`: required only when using the external `openai` provider

## Local Development

1. Install dependencies:

```bash
cmd /c npm install
```

2. Generate Prisma client:

```bash
npx prisma generate
```

3. Push the schema to your database:

```bash
npx prisma db push
```

4. Seed the database:

```bash
npm run db:seed
```

5. Start the app:

```bash
npm run dev
```

## ERA AI Feature

ERA is a lesson assistant that lives inside each lesson page and answers questions with lesson-aware, student-friendly explanations.

Implemented endpoints:

- `POST /api/era/chat`
- `GET /api/era/history?lesson_id=...`
- `GET /api/lesson/:id/context`

Current server-side flow:

1. A student opens `/courses/[courseSlug]/lessons/[lessonSlug]`.
2. The lesson page loads lesson content and materials from the database.
3. The student submits a question to ERA.
4. The server fetches the lesson context plus recent chat history for that user and lesson.
5. The configured LLM provider generates a response.
6. The question and answer are saved in `chat_messages`.
7. The response is returned to the lesson page UI.

Database additions for ERA:

- `LessonContent` stores lesson notes, objectives, and key points.
- `ChatMessage` stores per-user lesson chat history.

Provider notes:

- `ERA_LLM_PROVIDER=ollama` uses `OLLAMA_BASE_URL` and `ERA_MODEL_NAME`
- `ERA_LLM_PROVIDER=openai` uses `ERA_API_KEY` and `ERA_MODEL_NAME`

## ERA Guide Chatbot

ERA Guide is the lightweight website assistant that appears as a floating chatbot button across the public website.

What it does now:

- answers common platform questions with rule-based FAQ replies
- helps users register, sign in, find courses, open My Learning, and understand ERA
- shows quick action buttons for common tasks
- keeps replies short, clear, and link-based when possible

Main files:

- `src/components/era/era-guide-chatbot.tsx`
- `src/lib/era-guide/faq.ts`
- `src/lib/era-guide/matcher.ts`
- `src/lib/era-guide/types.ts`

How to add or update FAQ entries:

1. Open `src/lib/era-guide/faq.ts`.
2. Add a new object to `eraGuideFaqEntries`.
3. Give it a unique `id`, readable `label`, a list of `keywords`, and an `answer`.
4. Add optional `steps` and `links` if you want richer replies.
5. If the question should appear as a shortcut, also add it to `eraGuideQuickActions`.

Example entry shape:

```ts
{
  id: "billing",
  label: "How does billing work?",
  keywords: ["billing", "payment", "price"],
  answer: {
    title: "Billing help",
    body: "Short answer here.",
    steps: ["Step one", "Step two"],
    links: [{ label: "Open Pricing", href: "/pricing" }]
  }
}
```

How the matching works:

- the matcher normalizes the user question
- it scores FAQ entries by keyword overlap
- it returns the best matching answer
- if nothing matches, it shows a safe fallback response

How to add backend AI later:

1. Keep the current UI as-is.
2. Add a server route such as `POST /api/era-guide/chat`.
3. Run the FAQ matcher first on the server.
4. Only call an LLM if the FAQ matcher has low confidence.
5. Restrict the LLM prompt to known website features and server-side environment variables only.

This lets you add AI later without changing the floating launcher, chat panel, or quick action UI.

## Setup Notes For ERA

1. Set your Supabase-hosted `DATABASE_URL`.
2. Run `npx prisma db push`.
3. Run `npm run db:seed` if you want sample lesson content.
4. Set `ERA_LLM_PROVIDER`.
5. If using Ollama, start Ollama and pull a model such as `qwen2.5:7b`.
6. If using an external provider, set `ERA_API_KEY` only on the server.

## Deployment

### Vercel

1. Push the project to GitHub.
2. Import the repository into Vercel.
3. Add environment variables in the Vercel dashboard:
   - `DATABASE_URL`
   - `NEXT_PUBLIC_APP_URL`
   - `AUTH_SECRET`
   - `ERA_LLM_PROVIDER`
   - `ERA_MODEL_NAME`
   - `OLLAMA_BASE_URL` or `ERA_API_KEY`
4. Set the production domain in `NEXT_PUBLIC_APP_URL`.
5. Deploy. Prisma client generation is handled automatically through the `postinstall` script.

### PostgreSQL

Recommended options:

- Vercel Postgres
- Neon
- Supabase Postgres
- Railway Postgres

After provisioning the database:

1. Copy the connection string into `DATABASE_URL`.
2. Run `npx prisma db push`.
3. Run `npm run db:seed`.

## Production Readiness Notes

- `/admin` is excluded from indexing through route metadata and `robots.ts`.
- Public SEO is handled with route metadata and dynamic OpenGraph image generation.
- `sitemap.ts` includes public static, subject, and course routes.
- Loading and error states are included for public and admin route trees.
- Current admin forms are scaffolded for CMS workflows; persistent create/update/delete mutations can be added next with server actions.

## Design System

ERA now uses a simplified visual system focused on clarity and consistency:

- headings use `Poppins`
- body text uses `Inter`
- typography follows a shared `H1 / H2 / H3 / body / caption` scale
- spacing follows a consistent rhythm for sections, cards, and controls
- buttons, inputs, cards, badges, and dialogs share the same core sizing and radius rules
- shared utility classes such as `.page-title`, `.section-title`, `.card-title`, and `.page-lead` keep page hierarchy more consistent
- semantic status and surface utilities support cleaner feedback and panel styling

See [docs/design-system.md](./docs/design-system.md) for the working typography and spacing rules.

## Homepage Collections

The homepage now supports dynamic course collections that can refresh automatically as course activity changes:

- `Best Courses`: combines editorial priority, learner progress, enrollments, and course interest
- `Most Viewed`: uses real course page views
- `New Courses`: uses publish date
- `Trending Courses`: uses recent view growth and recent enrollments

Key files for this system:

- `src/server/courses.ts`
- `src/components/marketing/homepage-course-sections.tsx`
- `src/components/courses/course-card.tsx`
- `src/components/courses/course-view-tracker.tsx`
- `src/app/api/courses/[courseSlug]/view/route.ts`

## Onboarding System

ERA now includes a guided onboarding flow for new student accounts:

- welcome step after registration
- goal, level, and weekly time selection
- short goal-based assessment
- automatic recommended course and learning plan
- onboarding checklist inside My Learning

Key files for this system:

- `src/app/(public)/onboarding/page.tsx`
- `src/components/onboarding/onboarding-flow.tsx`
- `src/server/onboarding.ts`
- `src/app/api/onboarding/draft/route.ts`
- `src/app/api/onboarding/complete/route.ts`

## Structured Course System

ERA now supports a clearer learning hierarchy and stronger lesson flow:

- `Course -> Module -> Lesson -> Subskill`
- each lesson supports video, explanation, practice, and quiz content
- lesson and course progress are tracked
- students can resume the exact current lesson
- lesson status badges show completed, in progress, and locked states

Key files for this system:

- `prisma/schema.prisma`
- `src/server/lessons.ts`
- `src/components/courses/curriculum-list.tsx`
- `src/components/courses/lesson-sidebar.tsx`
- `src/components/courses/lesson-resume-tracker.tsx`
- `src/app/api/courses/[courseSlug]/progress/route.ts`

## Daily Improvements Log

Use [Daily_Improvements.md](./Daily_Improvements.md) for all daily work notes.

How to continue it each day:

1. Add the newest work session at the top of the `Daily Log` section.
2. Use `DD.MM.YYYY (Part X)` for every session.
3. Fill in `Title`, `Changes`, `Reason`, `Files Affected`, and `Status`.
4. Keep the notes short, clear, and understandable for both technical and non-technical readers.

## Useful Commands

```bash
npm run dev
npm run build
npm run start
npm run prisma:generate
npm run db:seed
```
