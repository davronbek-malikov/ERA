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
- Prisma seed data for local development
- SEO metadata, OpenGraph images, robots, and sitemap support
- Loading states, empty states, not-found handling, and global error boundary

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/era_academy?schema=public"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"
```

For production on Vercel:

- `DATABASE_URL`: your hosted PostgreSQL connection string
- `NEXT_PUBLIC_APP_URL`: your production domain, for example `https://your-app.vercel.app`

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

## Deployment

### Vercel

1. Push the project to GitHub.
2. Import the repository into Vercel.
3. Add environment variables in the Vercel dashboard:
   - `DATABASE_URL`
   - `NEXT_PUBLIC_APP_URL`
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

## Useful Commands

```bash
npm run dev
npm run build
npm run start
npm run prisma:generate
npm run db:seed
```
