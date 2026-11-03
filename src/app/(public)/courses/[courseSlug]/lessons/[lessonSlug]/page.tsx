import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, CirclePlay, FileText } from "lucide-react";

import { LessonResumeTracker } from "@/components/courses/lesson-resume-tracker";
import { LessonStudyShell } from "@/components/courses/lesson-study-shell";
import { PracticeLab } from "@/components/courses/practice-lab";
import { LessonChat } from "@/components/era/lesson-chat";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getLocale } from "@/lib/i18n-server";
import { createMetadata } from "@/lib/site";
import { cn } from "@/lib/utils";
import { getLessonBySlugs } from "@/server/lessons";

type LessonPageProps = {
  params: Promise<{
    courseSlug: string;
    lessonSlug: string;
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

export default async function LessonPage({ params }: LessonPageProps) {
  const { courseSlug, lessonSlug } = await params;
  const [locale, currentUser] = await Promise.all([getLocale(), getCurrentUser()]);
  const record = await getLessonBySlugs(courseSlug, lessonSlug, currentUser?.id ?? null);

  if (!record) {
    notFound();
  }

  const { course, lesson, previousLesson, nextLesson } = record;
  const lessonPath = `/courses/${course.slug}/lessons/${lesson.slug}`;
  const embedUrl = getVideoEmbedUrl(lesson.videoUrl);
  const copy =
    locale === "uz"
      ? {
          lesson: "Dars",
          currentLesson: "Joriy dars",
          lessonNotes: "Dars mazmuni",
          practice: "Practice lab",
          quiz: "Quiz",
          subskills: "Subskills",
          objectives: "Asosiy maqsadlar",
          keyPoints: "Muhim nuqtalar",
          backToCourse: "Kursga qaytish",
          previous: "Oldingi dars",
          next: "Keyingi dars",
          openMaterial: "Materialni ochish",
          fallbackPractice:
            "Bu dars bo'yicha qisqa yozma yoki amaliy mashq bajaring."
        }
      : {
          lesson: "Lesson",
          currentLesson: "Current lesson",
          lessonNotes: "Lesson notes",
          practice: "Practice lab",
          quiz: "Quiz",
          subskills: "Subskills",
          objectives: "Learning objectives",
          keyPoints: "Key points",
          backToCourse: "Back to course",
          previous: "Previous lesson",
          next: "Next lesson",
          openMaterial: "Open material",
          fallbackPractice: "Complete one short written or practical exercise for this lesson."
        };

  return (
    <Section className="pt-6 sm:pt-10">
      <Container className="space-y-8">
        <LessonResumeTracker courseSlug={course.slug} lessonId={lesson.id} />
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/courses/${course.slug}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <ArrowLeft className="h-4 w-4" />
            {copy.backToCourse}
          </Link>
          <Badge>{course.category.subject.name}</Badge>
          <Badge variant="outline">{course.title}</Badge>
          <Badge variant="secondary">
            {copy.lesson} {lesson.position}
          </Badge>
        </div>

        <Card className="overflow-hidden border-primary/10 bg-white">
          <CardContent className="space-y-5 p-4 sm:space-y-6 sm:p-6">
            <div className="space-y-4">
              <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                <CirclePlay className="h-3.5 w-3.5" />
                {copy.currentLesson}
              </p>
              <h1 className="page-title max-w-4xl">{lesson.title}</h1>
              <p className="page-lead max-w-3xl">
                {lesson.description ??
                  lesson.content?.overview ??
                  (locale === "uz"
                    ? "Bu dars uchun batafsil izoh keyinroq qo'shiladi."
                    : "A detailed lesson explanation will be added here soon.")}
              </p>
            </div>

            <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
              <div className="rounded-[1.4rem] bg-secondary/45 p-3.5 sm:p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{copy.lesson}</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{lesson.position}</p>
              </div>
              <div className="rounded-[1.4rem] bg-secondary/45 p-3.5 sm:p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Instructor</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{course.instructor.name}</p>
              </div>
              <div className="rounded-[1.4rem] bg-secondary/45 p-3.5 sm:p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Duration</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{lesson.duration ?? "Flexible"}</p>
              </div>
            </div>

            {lesson.videoUrl ? (
              <div className="overflow-hidden rounded-[1.4rem] border border-border/70 bg-slate-950 sm:rounded-[1.8rem]">
                {embedUrl ? (
                  <iframe
                    src={embedUrl}
                    title={lesson.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="aspect-video min-h-[220px] w-full sm:min-h-0"
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                ) : (
                  <video
                    controls
                    preload="metadata"
                    playsInline
                    className="aspect-video min-h-[220px] w-full bg-slate-950 sm:min-h-0"
                  >
                    <source src={lesson.videoUrl} />
                  </video>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[380px,minmax(0,1fr)] xl:gap-8">
          <LessonStudyShell
            courseSlug={course.slug}
            lessonId={lesson.id}
            lessonSlug={lesson.slug}
            lessonPath={lessonPath}
            locale={locale}
            lessons={course.lessons}
            previousLesson={previousLesson}
            nextLesson={nextLesson}
          />

          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[0.95fr,1.05fr]">
              <Card>
                <CardContent className="space-y-5 p-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {copy.practice}
                    </p>
                    <h2 className="card-title mt-2">
                      {locale === "uz" ? "Interaktiv mashq" : "Interactive practice"}
                    </h2>
                  </div>
                  <PracticeLab
                    exercises={lesson.practiceExercises}
                    locale={locale}
                    lessonPath={lessonPath}
                    isAuthenticated={Boolean(currentUser)}
                  />
                  {lesson.practiceExercises.length === 0 ? (
                    <div className="rounded-[1.4rem] border border-border/70 bg-secondary/35 px-4 py-4 text-sm leading-7 text-muted-foreground">
                      {lesson.content?.practicePrompt ?? copy.fallbackPractice}
                    </div>
                  ) : null}
                  {(lesson.content?.practiceChecklist?.length ?? 0) > 0 ? (
                    <div className="space-y-3">
                      {lesson.content!.practiceChecklist.map((item) => (
                        <div key={item} className="rounded-[1.2rem] border border-border/70 bg-white px-4 py-3 text-sm leading-7 text-muted-foreground">
                          {item}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-5 p-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {copy.quiz}
                    </p>
                    <h2 className="card-title mt-2">
                      {locale === "uz" ? "Qisqa tekshiruv" : "Quick check"}
                    </h2>
                  </div>
                  <div className="space-y-3">
                    {lesson.quizQuestions.map((question, index) => (
                      <div key={question.id} className="rounded-[1.25rem] border border-border/70 bg-white px-4 py-4">
                        <p className="text-sm font-medium text-foreground">
                          {index + 1}. {question.prompt}
                        </p>
                        <div className="mt-3 space-y-2">
                          {question.options.map((option, optionIndex) => (
                            <div key={`${question.id}-${option}`} className="rounded-[0.9rem] bg-secondary/35 px-3 py-2 text-sm text-muted-foreground">
                              {String.fromCharCode(65 + optionIndex)}. {option}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <LessonChat
              id="lesson-ai"
              lessonId={lesson.id}
              lessonPath={lessonPath}
              locale={locale}
              isAuthenticated={Boolean(currentUser)}
            />
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr),minmax(320px,0.85fr)]">
          <Card>
            <CardContent className="space-y-5 p-5">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {copy.lessonNotes}
                </p>
                <h2 className="card-title mt-2">{lesson.title}</h2>
              </div>
              <div className="whitespace-pre-wrap rounded-[1.4rem] border border-border/70 bg-secondary/35 px-4 py-4 text-sm leading-7 text-muted-foreground">
                {lesson.content?.content ?? lesson.description ?? "No lesson notes available yet."}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardContent className="space-y-5 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{copy.objectives}</p>
                    <h2 className="card-title">{copy.keyPoints}</h2>
                  </div>
                </div>

                <div className="space-y-3">
                  {lesson.subskills.length > 0 ? (
                    <div className="rounded-[1.25rem] border border-border/70 bg-accent/45 px-4 py-4">
                      <p className="eyebrow-label text-muted-foreground">{copy.subskills}</p>
                      <div className="mt-3 space-y-2">
                        {lesson.subskills.map((item) => (
                          <div key={item.id} className="text-sm leading-7 text-muted-foreground">
                            {item.title}
                            {item.description ? `: ${item.description}` : ""}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {(lesson.content?.learningObjectives ?? []).map((item) => (
                    <div key={item} className="rounded-[1.25rem] border border-border/70 bg-white px-4 py-3 text-sm leading-7 text-muted-foreground">
                      {item}
                    </div>
                  ))}

                  {(lesson.content?.keyPoints ?? []).map((item) => (
                    <div key={item} className="rounded-[1.25rem] border border-border/70 bg-secondary/35 px-4 py-3 text-sm leading-7 text-muted-foreground">
                      {item}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {lesson.materials.length > 0 ? (
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Materials</p>
                      <h2 className="card-title">Downloads</h2>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {lesson.materials.map((material) => (
                      <Link
                        key={material.id}
                        href={material.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(buttonVariants({ variant: "outline" }), "w-full justify-start")}
                      >
                        <FileText className="h-4 w-4" />
                        {material.title || copy.openMaterial}
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </Container>
    </Section>
  );
}

export async function generateMetadata({ params }: LessonPageProps): Promise<Metadata> {
  const { courseSlug, lessonSlug } = await params;
  const record = await getLessonBySlugs(courseSlug, lessonSlug);

  if (!record) {
    return createMetadata({
      title: "Lesson Not Found",
      description: "The requested lesson could not be found.",
      path: `/courses/${courseSlug}/lessons/${lessonSlug}`
    });
  }

  return createMetadata({
    title: `${record.lesson.title} | ${record.course.title}`,
    description:
      record.lesson.description ??
      record.lesson.content?.overview ??
      `Study ${record.lesson.title} with ERA lesson support.`,
    path: `/courses/${record.course.slug}/lessons/${record.lesson.slug}`
  });
}
