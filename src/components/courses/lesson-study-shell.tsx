"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Bot, CheckCircle2, Loader2, PlayCircle, Sparkles } from "lucide-react";

import { LessonSidebar } from "@/components/courses/lesson-sidebar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type LessonStudyShellProps = {
  courseSlug: string;
  lessonId: string;
  lessonSlug: string;
  lessonPath: string;
  locale: "en" | "uz";
  lessons: Array<{
    id: string;
    slug: string;
    title: string;
    position: number;
    moduleId: string | null;
    module: {
      id: string;
      title: string;
    } | null;
  }>;
  previousLesson: {
    slug: string;
    title: string;
  } | null;
  nextLesson: {
    slug: string;
    title: string;
  } | null;
};

type ProgressPayload = {
  authenticated: boolean;
  canTrack: boolean;
  completedLessonIds: string[];
  currentLessonId: string | null;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
};

const initialProgress: ProgressPayload = {
  authenticated: false,
  canTrack: false,
  completedLessonIds: [],
  currentLessonId: null,
  progressPercent: 0,
  completedLessons: 0,
  totalLessons: 0
};

export function LessonStudyShell({
  courseSlug,
  lessonId,
  lessonSlug,
  lessonPath,
  locale,
  lessons,
  previousLesson,
  nextLesson
}: LessonStudyShellProps) {
  const [progress, setProgress] = useState<ProgressPayload>(initialProgress);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      try {
        const response = await fetch(`/api/courses/${courseSlug}/progress`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as Partial<ProgressPayload>;

        if (!response.ok || cancelled) {
          return;
        }

        setProgress({
          authenticated: Boolean(payload.authenticated),
          canTrack: Boolean(payload.canTrack),
          completedLessonIds: payload.completedLessonIds ?? [],
          currentLessonId: payload.currentLessonId ?? lessonId,
          progressPercent: payload.progressPercent ?? 0,
          completedLessons: payload.completedLessons ?? 0,
          totalLessons: payload.totalLessons ?? lessons.length
        });
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadProgress();

    return () => {
      cancelled = true;
    };
  }, [courseSlug, lessonId, lessons.length]);

  const isCompleted = useMemo(
    () => progress.completedLessonIds.includes(lessonId),
    [progress.completedLessonIds, lessonId]
  );

  async function toggleCompletion() {
    if (!progress.canTrack || isToggling) {
      return;
    }

    setIsToggling(true);

    try {
      const response = await fetch(`/api/courses/${courseSlug}/progress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          lessonId,
          completed: !isCompleted,
          currentLessonId: lessonId
        })
      });
      const payload = (await response.json()) as Partial<ProgressPayload>;

      if (!response.ok) {
        return;
      }

      setProgress((current) => ({
        ...current,
        authenticated: Boolean(payload.authenticated ?? current.authenticated),
        canTrack: Boolean(payload.canTrack ?? current.canTrack),
        completedLessonIds: payload.completedLessonIds ?? current.completedLessonIds,
        currentLessonId: payload.currentLessonId ?? current.currentLessonId,
        progressPercent: payload.progressPercent ?? current.progressPercent,
        completedLessons: payload.completedLessons ?? current.completedLessons,
        totalLessons: payload.totalLessons ?? current.totalLessons
      }));
    } finally {
      setIsToggling(false);
    }
  }

  const copy =
    locale === "uz"
      ? {
          studyFlow: "Study Flow",
          tracker: "Lesson progress",
          complete: "Bajarildi deb belgilash",
          completed: "Bajarildi",
          askAi: "Ask AI",
          previous: "Oldingi dars",
          next: "Keyingi dars",
          signIn: "Progressni saqlash uchun kiring"
        }
      : {
          studyFlow: "Study Flow",
          tracker: "Lesson progress",
          complete: "Mark as complete",
          completed: "Completed",
          askAi: "Ask AI",
          previous: "Previous lesson",
          next: "Next lesson",
          signIn: "Sign in to save progress"
        };

  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-card">
        <CardContent className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{copy.tracker}</p>
              <h2 className="card-title mt-2">{progress.progressPercent}%</h2>
            </div>
            <div className="rounded-full bg-accent px-3 py-1 text-xs uppercase tracking-[0.14em] text-primary">
              {progress.completedLessons}/{progress.totalLessons || lessons.length}
            </div>
          </div>

          <div className="h-3 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${Math.max(0, Math.min(progress.progressPercent, 100))}%` }}
            />
          </div>

          <div className="grid gap-3">
            <Button
              type="button"
              onClick={toggleCompletion}
              disabled={!progress.canTrack || isToggling || isLoading}
            >
              {isToggling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {isCompleted ? copy.completed : copy.complete}
            </Button>
            {!progress.canTrack ? (
              <Link
                href={`/sign-in?next=${encodeURIComponent(lessonPath)}`}
                className={cn(buttonVariants({ variant: "outline" }), "w-full")}
              >
                <PlayCircle className="h-4 w-4" />
                {copy.signIn}
              </Link>
            ) : null}
            <Link href="#lesson-ai" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
              <Bot className="h-4 w-4" />
              {copy.askAi}
            </Link>
          </div>
        </CardContent>
      </Card>

      <LessonSidebar
        courseSlug={courseSlug}
        currentLessonId={lessonId}
        currentLessonSlug={lessonSlug}
        locale={locale}
        lessons={lessons}
        progress={progress}
      />

      <Card className="border-border/70 bg-card">
        <CardContent className="space-y-3 p-5">
          <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {copy.studyFlow}
          </p>
          {previousLesson ? (
            <Link
              href={`/courses/${courseSlug}/lessons/${previousLesson.slug}`}
              className={cn(buttonVariants({ variant: "outline" }), "w-full justify-start")}
            >
              <ArrowLeft className="h-4 w-4" />
              {copy.previous}: {previousLesson.title}
            </Link>
          ) : null}
          {nextLesson ? (
            <Link
              href={`/courses/${courseSlug}/lessons/${nextLesson.slug}`}
              className={cn(buttonVariants(), "w-full justify-start")}
            >
              {copy.next}: {nextLesson.title}
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
