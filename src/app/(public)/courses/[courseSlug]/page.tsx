import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpen,
  CirclePlay,
  GraduationCap,
  Layers3,
  Sparkles,
  Target,
  Video
} from "lucide-react";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { CourseCard } from "@/components/courses/course-card";
import { CourseEnrollmentPanel } from "@/components/courses/course-enrollment-panel";
import { CurriculumList } from "@/components/courses/curriculum-list";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDifficulty, formatDurationSummary, formatLessonSummary } from "@/lib/format";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { createMetadata } from "@/lib/site";
import { cn } from "@/lib/utils";
import { getCourseBySlug, getRelatedCourses } from "@/server/courses";

export const dynamic = "force-static";
export const revalidate = 3600;

type CourseDetailPageProps = {
  params: Promise<{
    courseSlug: string;
  }>;
  searchParams: Promise<{
    signedIn?: string;
  }>;
};

function getVideoEmbedUrl(url?: string | null) {
  if (!url) {
    return null;
  }

  if (url.includes("youtube.com/watch")) {
    const videoId = new URL(url).searchParams.get("v");
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  }

  if (url.includes("youtu.be/")) {
    const videoId = url.split("youtu.be/")[1]?.split("?")[0];
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  }

  if (url.includes("vimeo.com/")) {
    const videoId = url.split("vimeo.com/")[1]?.split("?")[0];
    return videoId ? `https://player.vimeo.com/video/${videoId}` : null;
  }

  return null;
}

export default async function CourseDetailPage({ params, searchParams }: CourseDetailPageProps) {
  const { courseSlug } = await params;
  const query = await searchParams;
  const locale = await getLocale();
  const t = getMessages(locale);
  const course = await getCourseBySlug(courseSlug);

  if (!course) {
    notFound();
  }

  const relatedCourses = await getRelatedCourses(
    course.id,
    course.categoryId,
    course.category.subject.id
  );
  const featuredLesson = course.lessons.find((lesson) => lesson.videoUrl) ?? course.lessons[0] ?? null;
  const featuredVideoUrl = featuredLesson?.videoUrl ?? course.promoVideoUrl ?? null;
  const embedUrl = getVideoEmbedUrl(featuredVideoUrl);
  const lessonSidebarCopy =
    locale === "uz"
      ? {
          videoLesson: "Video dars",
          videoReady: "Ko'rishga tayyor",
          continueFlow: "Dars oqimi",
          support: "Qo'llab-quvvatlovchi materiallar",
          supportBody: "Video, materiallar va progress bir joyda saqlanadi."
        }
      : {
          videoLesson: "Video lesson",
          videoReady: "Ready to watch",
          continueFlow: "Lesson flow",
          support: "Support materials",
          supportBody: "Video, resources, and progress live together in one place."
        };

  return (
    <Section className="pt-10 sm:pt-12">
      <Container className="space-y-12">
        {query.signedIn === "1" ? (
          <div className="rounded-[1.6rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {t.courseDetail.signedInSuccess}
          </div>
        ) : null}

        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge>{course.category.subject.name}</Badge>
            <Badge variant="outline">{course.category.name}</Badge>
            {course.isFeatured ? <Badge variant="secondary">{t.courseDetail.featured}</Badge> : null}
            {course.isPopular ? <Badge variant="secondary">{t.courseDetail.popular}</Badge> : null}
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.05fr,0.95fr] lg:items-end">
            <div className="space-y-5">
              <h1 className="max-w-4xl font-display text-4xl font-semibold leading-[1.04] text-balance sm:text-5xl lg:text-[4rem]">
                {course.title}
              </h1>
              <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
                {course.description ??
                  course.shortDescription ??
                  (locale === "uz"
                    ? "Video darslar, progress va amaliy mashqlar uchun tayyorlangan toza o'quv sahifasi."
                    : "A focused learning page built around video lessons, progress, and practical momentum.")}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[1.5rem] border border-border/70 bg-white px-4 py-4 shadow-soft">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {t.courseDetail.instructor}
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">{course.instructor.name}</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-white px-4 py-4 shadow-soft">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {t.courseDetail.difficulty}
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {formatDifficulty(course.difficulty, locale)}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-white px-4 py-4 shadow-soft">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {t.courseDetail.lessonCount}
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {formatLessonSummary(course.lessons.length, locale)}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-white px-4 py-4 shadow-soft">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {t.courseDetail.studyTime}
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {formatDurationSummary(course.durationMinutes, locale)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.12fr),360px]">
          <div className="space-y-6">
            <Card className="overflow-hidden border-primary/10 bg-white shadow-panel">
              <CardContent className="space-y-5 p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {lessonSidebarCopy.videoLesson}
                    </p>
                    <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
                      {featuredLesson?.title ?? course.title}
                    </h2>
                  </div>
                  <div className="rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent-foreground">
                    {lessonSidebarCopy.videoReady}
                  </div>
                </div>

                <div className="overflow-hidden rounded-[1.8rem] border border-border/70 bg-slate-950">
                  {embedUrl ? (
                    <iframe
                      src={embedUrl}
                      title={featuredLesson?.title ?? course.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="aspect-video h-full w-full"
                      loading="lazy"
                    />
                  ) : featuredVideoUrl ? (
                    <video
                      controls
                      preload="metadata"
                      poster={course.thumbnailUrl ?? undefined}
                      className="aspect-video h-full w-full bg-slate-950 object-cover"
                    >
                      <source src={featuredVideoUrl} />
                    </video>
                  ) : (
                    <div
                      className="aspect-video w-full bg-[linear-gradient(135deg,#312e81,#4f46e5_55%,#818cf8)]"
                      style={
                        course.thumbnailUrl
                          ? {
                              backgroundImage: `linear-gradient(180deg,rgba(15,23,42,0.3),rgba(15,23,42,0.42)), url(${course.thumbnailUrl})`,
                              backgroundPosition: "center",
                              backgroundSize: "cover"
                            }
                          : undefined
                      }
                    >
                      <div className="flex h-full items-end p-6">
                        <div className="rounded-[1.5rem] bg-white/12 px-5 py-4 text-white backdrop-blur">
                          <p className="text-xs uppercase tracking-[0.16em] text-white/72">
                            {t.courseDetail.curriculum}
                          </p>
                          <p className="mt-2 max-w-sm text-lg font-semibold">
                            {t.courseDetail.curriculumPreparing}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {featuredLesson?.description ? (
                  <p className="text-sm leading-7 text-muted-foreground">{featuredLesson.description}</p>
                ) : null}
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[0.95fr,1.05fr]">
              <Card>
                <CardContent className="space-y-6 p-6">
                  <div className="space-y-3">
                    <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                      {t.courseDetail.learningOutcomes}
                    </p>
                    <h2 className="font-display text-3xl font-semibold">{t.courseDetail.achieve}</h2>
                  </div>
                  <div className="space-y-4">
                    {course.outcomes.map((outcome) => (
                      <div
                        key={outcome}
                        className="flex items-start gap-3 rounded-[1.5rem] border border-border/70 bg-secondary/35 px-4 py-4"
                      >
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white">
                          <Target className="h-4 w-4 text-primary" />
                        </div>
                        <p className="text-sm leading-7 text-muted-foreground">{outcome}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-6 p-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-[1.4rem] bg-secondary/55 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {t.courseDetail.instructor}
                      </p>
                      <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                        <GraduationCap className="h-4 w-4 text-primary" />
                        {course.instructor.name}
                      </p>
                    </div>
                    <div className="rounded-[1.4rem] bg-secondary/55 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {t.courseDetail.category}
                      </p>
                      <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Sparkles className="h-4 w-4 text-primary" />
                        {course.category.name}
                      </p>
                    </div>
                    <div className="rounded-[1.4rem] bg-secondary/55 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {t.courseDetail.lessonCount}
                      </p>
                      <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Layers3 className="h-4 w-4 text-primary" />
                        {formatLessonSummary(course.lessons.length, locale)}
                      </p>
                    </div>
                    <div className="rounded-[1.4rem] bg-secondary/55 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {t.courseDetail.studyTime}
                      </p>
                      <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                        <BookOpen className="h-4 w-4 text-primary" />
                        {formatDurationSummary(course.durationMinutes, locale)}
                      </p>
                    </div>
                  </div>

                  <CourseEnrollmentPanel courseSlug={course.slug} locale={locale} />
                </CardContent>
              </Card>
            </div>

            <div id="curriculum">
              <CurriculumList
                courseSlug={course.slug}
                locale={locale}
                lessons={course.lessons}
                courseMaterials={course.materials}
              />
            </div>
          </div>

          <div className="space-y-6">
            <Card className="overflow-hidden border-border/70 bg-white">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {lessonSidebarCopy.continueFlow}
                    </p>
                    <h2 className="mt-2 font-display text-2xl font-semibold text-foreground">
                      {t.courseDetail.curriculum}
                    </h2>
                  </div>
                  <div className="rounded-full bg-accent p-3 text-primary">
                    <Video className="h-4 w-4" />
                  </div>
                </div>

                <div className="space-y-3">
                  {course.lessons.slice(0, 6).map((lesson) => (
                    <div
                      key={lesson.id}
                      className={cn(
                        "rounded-[1.4rem] border border-border/70 bg-secondary/35 px-4 py-4 transition-colors",
                        featuredLesson?.id === lesson.id && "border-primary/20 bg-accent/70"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            {t.courseDetail.lessonLabel} {lesson.position}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-foreground">{lesson.title}</p>
                        </div>
                        <CirclePlay className="mt-1 h-4 w-4 shrink-0 text-primary" />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {lesson.duration ?? (locale === "uz" ? "Video dars" : "Video lesson")}
                      </p>
                    </div>
                  ))}
                </div>

                {course.lessons.length > 0 ? (
                  <Link href="#curriculum" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
                    {t.courseDetail.viewCurriculum}
                  </Link>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-[linear-gradient(180deg,rgba(249,250,255,0.95),rgba(255,255,255,1))]">
              <CardContent className="space-y-3 p-5">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {lessonSidebarCopy.support}
                </p>
                <p className="font-display text-2xl font-semibold text-foreground">
                  {locale === "uz" ? "O'rganishni toza usulda davom ettiring" : "Keep learning without distraction"}
                </p>
                <p className="text-sm leading-7 text-muted-foreground">
                  {lessonSidebarCopy.supportBody}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-8">
          <div className="space-y-3">
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
              {t.courseDetail.relatedCourses}
            </p>
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">
              {t.courseDetail.momentum}
            </h2>
          </div>

          {relatedCourses.length === 0 ? (
            <EmptyState
              title={t.courseDetail.noRelatedTitle}
              description={t.courseDetail.noRelatedDescription}
              actionLabel={t.courseDetail.browseAllCourses}
              actionHref="/courses"
            />
          ) : (
            <div className="grid gap-6 xl:grid-cols-3">
              {relatedCourses.map((relatedCourse) => (
                <CourseCard key={relatedCourse.id} course={relatedCourse} locale={locale} />
              ))}
            </div>
          )}
        </div>
      </Container>
    </Section>
  );
}

export async function generateMetadata({ params }: CourseDetailPageProps): Promise<Metadata> {
  const { courseSlug } = await params;
  const course = await getCourseBySlug(courseSlug);

  if (!course) {
    return createMetadata({
      title: "Course Not Found",
      description: "The requested course could not be found.",
      path: `/courses/${courseSlug}`
    });
  }

  return createMetadata({
    title: course.title,
    description:
      course.shortDescription ??
      course.description ??
      `Explore ${course.title} with curriculum, outcomes, and related courses.`,
    path: `/courses/${course.slug}`,
    images: course.thumbnailUrl ? [course.thumbnailUrl] : undefined
  });
}
