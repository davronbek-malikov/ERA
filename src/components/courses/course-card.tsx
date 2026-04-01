import Link from "next/link";
import { CourseDifficulty } from "@prisma/client";
import { BookOpen, Layers3, Star } from "lucide-react";

import { CourseEnrollmentButton } from "@/components/courses/course-enrollment-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDifficulty, formatDurationSummary, formatLessonSummary } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type CourseCardProps = {
  course: {
    slug: string;
    title: string;
    subtitle?: string | null;
    shortDescription: string | null;
    instructor: {
      name: string;
    };
    difficulty: CourseDifficulty;
    thumbnailUrl: string | null;
    isFeatured: boolean;
    isPopular: boolean;
    _count: {
      lessons: number;
    };
    durationMinutes?: number;
    category: {
      name: string;
      subject: {
        name: string;
      };
    };
  };
  locale: Locale;
};

export function CourseCard({ course, locale }: CourseCardProps) {
  const t = getMessages(locale);
  return (
    <Card className="overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:rounded-[1.9rem] hover:shadow-lg">
      <div
        className="relative h-56 border-b border-white/60 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.32),transparent_35%),linear-gradient(135deg,rgba(31,50,86,0.96),rgba(102,111,131,0.9))]"
        style={
          course.thumbnailUrl
            ? {
                backgroundImage: `linear-gradient(180deg, rgba(31,50,86,0.18), rgba(31,50,86,0.45)), url(${course.thumbnailUrl})`,
                backgroundPosition: "center",
                backgroundSize: "cover"
              }
            : undefined
        }
      >
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative flex h-full flex-col justify-between p-6 text-white">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="bg-white/15 text-white">
              {course.category.subject.name}
            </Badge>
            <Badge variant="secondary" className="bg-white/15 text-white">
              {course.category.name}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {course.isFeatured ? (
              <Badge variant="secondary" className="bg-white text-primary">
                {locale === "uz" ? "Tavsiya etilgan" : "Featured"}
              </Badge>
            ) : null}
            {course.isPopular ? (
              <Badge variant="secondary" className="bg-amber-100 text-amber-900">
                {locale === "uz" ? "Mashhur" : "Popular"}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <CardHeader className="space-y-4">
        <CardTitle className="text-3xl leading-tight">{course.title}</CardTitle>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div className="inline-flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            {course.instructor.name}
          </div>
          <div className="inline-flex items-center gap-2">
            <Star className="h-4 w-4" />
            {formatDifficulty(course.difficulty, locale)}
          </div>
          <div className="inline-flex items-center gap-2">
            <Layers3 className="h-4 w-4" />
            {formatLessonSummary(course._count.lessons, locale)}
          </div>
          {typeof course.durationMinutes === "number" ? (
            <div className="inline-flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              {formatDurationSummary(course.durationMinutes, locale)}
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent>
        <p className="text-sm leading-7 text-muted-foreground">
          {course.shortDescription ?? t.courses.polishedFallback}
        </p>
        {course.subtitle ? (
          <p className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground/90">
            {course.subtitle}
          </p>
        ) : null}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-muted-foreground">
          {course._count.lessons > 0 ? t.courses.structuredOverview : t.courses.curriculumSoon}
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <CourseEnrollmentButton
            courseSlug={course.slug}
            size="sm"
            variant="ghost"
            enrollLabel={t.courses.add}
            enrolledLabel={t.courses.myLearningShort}
            signInPath={`/sign-in?next=/courses/${course.slug}`}
          />
          <Link
            href={`/courses/${course.slug}`}
            prefetch
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
          >
            {t.home?.viewCourse ?? "View course"}
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
