import type { Metadata } from "next";
import { CourseDifficulty } from "@prisma/client";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { CourseCard } from "@/components/courses/course-card";
import { CourseFilters } from "@/components/courses/course-filters";
import { SectionHeading } from "@/components/marketing/section-heading";
import { EmptyState } from "@/components/shared/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createMetadata } from "@/lib/site";
import { getCourseFiltersData, getCourses } from "@/server/courses";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export const metadata: Metadata = createMetadata({
  title: "Courses",
  description:
    "Browse the ERA Academy course catalog with filters for subject, category, difficulty, and search.",
  path: "/courses"
});

type CoursesPageProps = {
  searchParams: Promise<{
    subject?: string;
    category?: string;
    difficulty?: string;
    search?: string;
    signedUp?: string;
    signedIn?: string;
    welcome?: string;
  }>;
};

function parseDifficulty(value?: string) {
  if (!value) {
    return undefined;
  }

  const options = Object.values(CourseDifficulty);
  return options.includes(value as CourseDifficulty) ? (value as CourseDifficulty) : undefined;
}

export default async function CoursesPage({ searchParams }: CoursesPageProps) {
  const filters = await searchParams;
  const locale = await getLocale();
  const t = getMessages(locale);
  const [currentUser, filterData, courses] = await Promise.all([
    getCurrentUser(),
    getCourseFiltersData(),
    getCourses({
      subject: filters.subject,
      category: filters.category,
      difficulty: parseDifficulty(filters.difficulty),
      search: filters.search
    })
  ]);

  return (
    <Section>
      <Container className="space-y-12">
        {currentUser?.role === "STUDENT" &&
        !filters.subject &&
        !filters.category &&
        !filters.difficulty &&
        !filters.search ? (
          <div className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-primary">
            {t.courses.myLearningHint}{" "}
            <Link
              href="/my-learning"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "h-8 px-2 text-primary underline underline-offset-4 hover:text-primary"
              )}
            >
              {t.courses.openMyLearning}
            </Link>
          </div>
        ) : null}
        {filters.signedUp === "1" || filters.signedIn === "1" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {filters.signedUp === "1" ? t.courses.signedUp : t.courses.signedIn}
          </div>
        ) : null}
        <SectionHeading
          eyebrow={locale === "uz" ? "Kurslar" : "Courses"}
          title={t.courses.title}
          description={t.courses.description}
        />

        <CourseFilters subjects={filterData} selected={filters} locale={locale} />

        {courses.length === 0 ? (
          <EmptyState
            title={t.courses.noMatchTitle}
            description={t.courses.noMatchDescription}
            actionLabel={t.courses.resetCatalog}
            actionHref="/courses"
          />
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} locale={locale} />
            ))}
          </div>
        )}
      </Container>
    </Section>
  );
}
