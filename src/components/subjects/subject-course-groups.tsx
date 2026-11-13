import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatDifficulty,
  formatDurationSummary,
  formatLessonSummary,
  parseDurationToMinutes
} from "@/lib/format";
import { getMessages, type Locale } from "@/lib/i18n";

type SubjectCourseGroupsProps = {
  locale: Locale;
  categories: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    courses: Array<{
      id: string;
      slug: string;
      title: string;
      shortDescription: string | null;
      instructor: {
        name: string;
      };
      difficulty: string;
      lessons?: Array<{
        duration: string | null;
      }>;
      _count: {
        lessons: number;
      };
    }>;
  }>;
};

export function SubjectCourseGroups({ locale, categories }: SubjectCourseGroupsProps) {
  const t = getMessages(locale);
  if (categories.length === 0) {
    return (
      <EmptyState
        title={locale === "uz" ? "Hali kategoriyalar nashr qilinmagan" : "No categories published yet"}
        description={
          locale === "uz"
            ? "Bu fan mavjud, ammo hozircha ko'rsatish uchun nashr qilingan kategoriya yoki kurslar yo'q."
            : "This subject exists, but there are no published categories or courses to show yet."
        }
        actionLabel={t.courseDetail.browseAllCourses}
        actionHref="/courses"
      />
    );
  }

  return (
    <div className="space-y-8">
      {categories.map((category) => (
        <Card key={category.id}>
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">{category.name}</Badge>
              <span className="text-sm text-muted-foreground">
                {category.courses.length} {t.subjects.courses}
              </span>
            </div>
            <CardTitle className="text-3xl">{category.name}</CardTitle>
            {category.description ? (
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                {category.description}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {category.courses.length === 0 ? (
              <div className="md:col-span-2">
                <EmptyState
                  title={locale === "uz" ? "Bu kategoriyada kurslar yo'q" : "No courses in this category"}
                  description={
                    locale === "uz"
                      ? "Talabalar katalogida ko'rinishi uchun admin CMS orqali bu kategoriyaga nashr qilingan kurslar qo'shing."
                      : "Add published courses to this category from the admin CMS to make it visible in the student catalog."
                  }
                />
              </div>
            ) : (
              category.courses.map((course) => (
                <Link
                  key={course.id}
                  href={`/courses/${course.slug}`}
                  className="rounded-xl border border-border/70 bg-secondary/30 p-5 transition hover:border-primary/20 hover:bg-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-3">
                      <h3 className="font-display text-2xl">{course.title}</h3>
                      <p className="text-sm leading-7 text-muted-foreground">
                        {course.shortDescription ??
                          (locale === "uz"
                            ? "Kuchli progress uchun yaratilgan tartibli o'quv dasturi."
                            : "Structured curriculum built for strong progression.")}
                      </p>
                      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        <span>{course.instructor.name}</span>
                        <span>{formatDifficulty(course.difficulty, locale)}</span>
                        <span>{formatLessonSummary(course._count.lessons, locale)}</span>
                        {course.lessons ? (
                          <span>
                            {formatDurationSummary(
                              course.lessons.reduce((sum, lesson) => {
                                return sum + parseDurationToMinutes(lesson.duration);
                              }, 0),
                              locale
                            )}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
