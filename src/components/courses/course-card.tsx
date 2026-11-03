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
    personalizedReason?: string | null;
    progressPercent?: number | null;
    actionLabel?: string | null;
    actionHref?: string | null;
    shortDescription: string | null;
    instructor: {
      name: string;
    };
    difficulty: CourseDifficulty;
    thumbnailUrl: string | null;
    isFeatured: boolean;
    isPopular: boolean;
    badges?: string[];
    _count: {
      lessons: number;
    };
    averageRating?: number | null;
    reviewCount?: number;
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
  const localizedBadgeMap: Record<string, string> =
    locale === "uz"
      ? {
          Featured: "Tavsiya etilgan",
          Popular: "Mashhur",
          Trending: "Trend",
          New: "Yangi",
          "Best Seller": "Eng ko'p tanlangan",
          "Editor Pick": "Muharrir tanlovi",
          "High Progress": "Yuqori progress"
        }
      : {
          Featured: "Featured",
          Popular: "Popular",
          Trending: "Trending",
          New: "New",
          "Best Seller": "Best seller",
          "Editor Pick": "Editor's pick",
          "High Progress": "High progress"
        };
  const visibleBadges = Array.from(
    new Set([
      ...(course.badges ?? []),
      ...(course.isFeatured ? ["Featured"] : []),
      ...(course.isPopular ? ["Popular"] : [])
    ])
  ).slice(0, 3);
  const progressPercent =
    typeof course.progressPercent === "number"
      ? Math.max(0, Math.min(course.progressPercent, 100))
      : null;
  const primaryHref = course.actionHref ?? `/courses/${course.slug}`;
  const primaryLabel = course.actionLabel ?? (t.home?.viewCourse ?? "View course");

  return (
    <Card className="overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-panel">
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
            {visibleBadges.map((badge) => (
              <Badge
                key={badge}
                variant="secondary"
                className={cn(
                  "bg-white/15 text-white",
                  (badge === "Best Seller" || badge === "Popular") && "bg-amber-100 text-amber-900",
                  badge === "New" && "bg-emerald-100 text-emerald-900",
                  badge === "Trending" && "bg-rose-100 text-rose-900",
                  (badge === "Featured" || badge === "Editor Pick") && "bg-white text-primary"
                )}
              >
                {localizedBadgeMap[badge] ?? badge}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <CardHeader className="space-y-4">
        <CardTitle className="break-words sm:text-[1.55rem]">{course.title}</CardTitle>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div className="inline-flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            {course.instructor.name}
          </div>
          <div className="inline-flex items-center gap-2">
            <Star className="h-4 w-4" />
            {formatDifficulty(course.difficulty, locale)}
          </div>
          {course.averageRating ? (
            <div className="inline-flex items-center gap-2">
              <Star className="h-4 w-4 fill-current text-amber-500" />
              {course.averageRating.toFixed(1)} ({course.reviewCount ?? 0})
            </div>
          ) : null}
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
          <p className="mt-3 break-words text-xs tracking-[0.02em] text-muted-foreground/90">
            {course.subtitle}
          </p>
        ) : null}
        {course.personalizedReason ? (
          <div className="mt-4 rounded-xl bg-secondary/55 px-4 py-3 text-sm text-muted-foreground">
            {course.personalizedReason}
          </div>
        ) : null}
        {progressPercent !== null ? (
          <div className="mt-4 space-y-2 rounded-xl border border-border/70 px-4 py-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <span>{locale === "uz" ? "Progress" : "Progress"}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-3">
        <span className="max-w-full break-words text-sm leading-6 text-muted-foreground">
          {course._count.lessons > 0 ? t.courses.structuredOverview : t.courses.curriculumSoon}
        </span>
        <div className="grid w-full gap-2 sm:grid-cols-2">
          <CourseEnrollmentButton
            courseSlug={course.slug}
            size="sm"
            variant="ghost"
            enrollLabel={t.courses.add}
            enrolledLabel={t.courses.myLearningShort}
            signInPath={`/sign-in?next=/courses/${course.slug}`}
            fullWidth
            className="justify-center"
          />
          <Link
            href={primaryHref}
            prefetch
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "min-w-0 w-full justify-center px-3 text-center"
            )}
          >
            {primaryLabel}
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
