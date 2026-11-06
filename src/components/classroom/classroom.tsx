"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bookmark, CheckCircle2, ChevronLeft, ChevronRight, FileText, ListTree, Trash2 } from "lucide-react";

import { AskEraZone } from "@/components/ai/ask-era-zone";
import { ClassroomTutor, useTutorApi } from "@/components/classroom/classroom-tutor";
import { CurriculumNav } from "@/components/classroom/curriculum-nav";
import { LessonPlayer, type HandRaiseAction } from "@/components/classroom/lesson-player";
import { PlayerProvider, usePlayerHandle } from "@/components/classroom/player-context";
import { LessonResumeTracker } from "@/components/courses/lesson-resume-tracker";
import { PracticeLab } from "@/components/courses/practice-lab";
import { LessonModeBanner } from "@/components/education/lesson-mode-banner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { formatClock } from "@/lib/era/tutor-client";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { getClassroom } from "@/server/student";

export type ClassroomData = NonNullable<Awaited<ReturnType<typeof getClassroom>>["classroom"]>;

const copy = {
  en: {
    back: "Course",
    lessons: "Lessons",
    lessonOf: (n: number, total: number) => `Lesson ${n} of ${total}`,
    overview: "Overview",
    notes: "Notes",
    materials: "Materials",
    practice: "Practice",
    quiz: "Quiz",
    bookmarks: "Bookmarks",
    objectives: "What you'll learn",
    keyPoints: "Key points",
    noNotes: "Notes for this lesson aren't available yet.",
    noMaterials: "No materials for this lesson.",
    open: "Open",
    noBookmarks: "Bookmark moments in the video to come back to them. Bookmarks are saved on this device.",
    removeBookmark: "Remove bookmark",
    jumpTo: (time: string) => `Jump to ${time}`,
    bookmarked: (time: string) => `Bookmarked ${time}`,
    quizNote: "Answering and scoring quiz questions isn't available yet.",
    previewPractice: "Practice runs are turned off in preview, so nothing is saved.",
    markComplete: "Mark lesson complete",
    completed: "Lesson completed",
    completeError: "The lesson couldn't be marked complete. Try again.",
    previous: "Previous",
    next: "Next",
    askAt: (time: string) => `Ask ERA at ${time}`,
    prompts: {
      explain: "Explain what is being taught at this moment.",
      example: "Give me a simple example of what is explained here.",
      translate: "Explain this part in Uzbek, simply."
    },
    skip: "Skip to lesson"
  },
  uz: {
    back: "Kurs",
    lessons: "Darslar",
    lessonOf: (n: number, total: number) => `${total} ta darsdan ${n}-dars`,
    overview: "Umumiy",
    notes: "Izohlar",
    materials: "Materiallar",
    practice: "Amaliyot",
    quiz: "Test",
    bookmarks: "Belgilar",
    objectives: "Nimalarni o'rganasiz",
    keyPoints: "Asosiy nuqtalar",
    noNotes: "Bu dars uchun izohlar hali mavjud emas.",
    noMaterials: "Bu dars uchun materiallar yo'q.",
    open: "Ochish",
    noBookmarks: "Qaytish uchun videodagi lahzalarni belgilang. Belgilar shu qurilmada saqlanadi.",
    removeBookmark: "Belgini o'chirish",
    jumpTo: (time: string) => `${time} ga o'tish`,
    bookmarked: (time: string) => `${time} belgilandi`,
    quizNote: "Test savollariga javob berish va baholash hozircha mavjud emas.",
    previewPractice: "Ko'rib chiqish rejimida amaliyot o'chirilgan, hech narsa saqlanmaydi.",
    markComplete: "Darsni tugatilgan deb belgilash",
    completed: "Dars tugatildi",
    completeError: "Darsni tugatilgan deb belgilab bo'lmadi. Qayta urinib ko'ring.",
    previous: "Oldingi",
    next: "Keyingi",
    askAt: (time: string) => `${time} da ERAdan so'rash`,
    prompts: {
      explain: "Shu lahzada nima o'rgatilayotganini tushuntiring.",
      example: "Bu yerda tushuntirilgan narsaga oddiy misol keltiring.",
      translate: "Bu qismni o'zbek tilida sodda qilib tushuntiring."
    },
    skip: "Darsga o'tish"
  }
};

type Props = { data: ClassroomData; locale: Locale };

function useBookmarks(lessonId: string) {
  const key = `era:bookmarks:${lessonId}`;
  const [items, setItems] = React.useState<number[]>([]);
  React.useEffect(() => {
    try {
      setItems(JSON.parse(window.localStorage.getItem(key) ?? "[]"));
    } catch {
      setItems([]);
    }
  }, [key]);
  const save = (next: number[]) => {
    setItems(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  };
  return {
    items,
    add: (seconds: number) => save([...new Set([...items, Math.floor(seconds)])].sort((a, b) => a - b)),
    remove: (seconds: number) => save(items.filter((item) => item !== seconds))
  };
}

function LessonContent({ data, locale }: Props) {
  const t = copy[locale];
  const router = useRouter();
  const tutor = useTutorApi();
  const player = usePlayerHandle();
  const bookmarks = useBookmarks(data.lesson.id);
  const isStudent = data.mode === "student";
  const [completed, setCompleted] = React.useState(data.lesson.completed);
  const [saving, setSaving] = React.useState(false);
  const lessonPath = `/learn/courses/${data.course.slug}/lessons/${data.lesson.slug}`;
  const content = data.lesson.content;
  // Ask ERA AI: students ask the tutor (same conversation); teacher preview / admin inspection get their own agent.
  const askWorkspace = data.mode === "student" ? "student" : data.mode === "teacher-preview" ? "teacher" : "admin";
  const askLocale = locale === "uz" ? "uz" : "en";
  const onAsk = isStudent && tutor ? tutor.askSelection : undefined;

  const markComplete = React.useCallback(async () => {
    if (!isStudent || completed) return;
    setSaving(true);
    try {
      // Existing progress API: records the completion and updates course progress.
      const response = await fetch(`/api/courses/${data.course.slug}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: data.lesson.id, completed: true })
      });
      if (!response.ok) throw new Error();
      setCompleted(true);
      toast({ title: t.completed, variant: "success" });
      router.refresh();
    } catch {
      toast({ title: t.completeError, variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [completed, data.course.slug, data.lesson.id, isStudent, router, t]);

  function handRaise(action: HandRaiseAction, seconds: number | null) {
    if (!tutor) return;
    if (action === "ask") tutor.focus(seconds);
    else tutor.ask(t.prompts[action], seconds);
  }

  const tabs = [
    { value: "overview", label: t.overview },
    { value: "notes", label: t.notes },
    { value: "materials", label: `${t.materials}${data.lesson.materials.length ? ` (${data.lesson.materials.length})` : ""}` },
    ...(data.lesson.practiceExercises.length > 0 ? [{ value: "practice", label: t.practice }] : []),
    ...(data.lesson.quizQuestions.length > 0 ? [{ value: "quiz", label: t.quiz }] : []),
    ...(isStudent ? [{ value: "bookmarks", label: `${t.bookmarks}${bookmarks.items.length ? ` (${bookmarks.items.length})` : ""}` }] : [])
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-4 md:px-6 lg:py-6">
      {isStudent ? <LessonResumeTracker courseSlug={data.course.slug} lessonId={data.lesson.id} /> : null}

      {/* On phones the video stays visible at the top while the tabs scroll and the tutor sheet is open. */}
      <div className="sticky top-header z-10 -mx-4 bg-background px-4 pb-2 pt-1 md:static md:mx-0 md:px-0 md:pb-0 md:pt-0">
        <LessonPlayer
          lessonId={data.lesson.id}
          title={data.lesson.title}
          videoUrl={data.lesson.videoUrl}
          locale={locale}
          persist={isStudent}
          onWatched={isStudent ? () => void markComplete() : undefined}
          onHandRaise={tutor ? handRaise : undefined}
          onBookmark={
            isStudent
              ? (seconds) => {
                  bookmarks.add(seconds);
                  toast({ title: t.bookmarked(formatClock(seconds)), variant: "success" });
                }
              : undefined
          }
        />
      </div>

      <header className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t.lessonOf(data.lesson.position, data.totalCount)}</p>
        <h1 className="page-title">{data.lesson.title}</h1>
        {data.lesson.description ? <p className="page-lead">{data.lesson.description}</p> : null}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {isStudent ? (
            completed ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {t.completed}
              </span>
            ) : (
              <Button variant="outline" onClick={() => void markComplete()} loading={saving}>
                <CheckCircle2 />
                {t.markComplete}
              </Button>
            )
          ) : null}
        </div>
      </header>

      <Tabs defaultValue="overview">
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <AskEraZone workspace={askWorkspace} source={{ type: "lesson", id: data.lesson.id }} locale={askLocale} onAsk={onAsk} className="flex flex-col gap-5">
          {content?.overview ? <p className="section-copy">{content.overview}</p> : null}
          {content && content.learningObjectives.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="card-title">{t.objectives}</h2>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm marker:text-muted-foreground">
                {content.learningObjectives.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {content && content.keyPoints.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="card-title">{t.keyPoints}</h2>
              <ul className="flex flex-col gap-2">
                {content.keyPoints.map((item) => (
                  <li key={item} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {!content ? <p className="text-sm text-muted-foreground">{t.noNotes}</p> : null}
          </AskEraZone>
        </TabsContent>

        <TabsContent value="notes">
          {content?.content ? (
            <AskEraZone workspace={askWorkspace} source={{ type: "lesson", id: data.lesson.id }} locale={askLocale} onAsk={onAsk}>
              <div className="whitespace-pre-wrap rounded-xl border border-border bg-card p-4 text-sm leading-7">{content.content}</div>
            </AskEraZone>
          ) : (
            <p className="text-sm text-muted-foreground">{t.noNotes}</p>
          )}
        </TabsContent>

        <TabsContent value="materials">
          {data.lesson.materials.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noMaterials}</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {data.lesson.materials.map((material) => (
                <li key={material.id} className="flex items-center gap-3 px-4 py-3">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <AskEraZone workspace={askWorkspace} source={{ type: "reading", id: material.id }} locale={askLocale} onAsk={onAsk} className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{material.title}</span>
                  </AskEraZone>
                  <a href={material.href} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                    {t.open}
                    <span className="sr-only">: {material.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {data.lesson.practiceExercises.length > 0 ? (
          <TabsContent value="practice">
            {isStudent ? (
              <PracticeLab exercises={data.lesson.practiceExercises} locale={locale} lessonPath={lessonPath} isAuthenticated />
            ) : (
              <Alert variant="info">{t.previewPractice}</Alert>
            )}
          </TabsContent>
        ) : null}

        {data.lesson.quizQuestions.length > 0 ? (
          <TabsContent value="quiz" className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">{t.quizNote}</p>
            <ol className="flex flex-col gap-3">
              {data.lesson.quizQuestions.map((question, index) => (
                <li key={question.id} className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-medium">
                    {index + 1}. {question.prompt}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {question.options.map((option, optionIndex) => (
                      <li key={option} className="rounded-lg bg-muted/60 px-3 py-1.5 text-sm">
                        {String.fromCharCode(65 + optionIndex)}. {option}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </TabsContent>
        ) : null}

        {isStudent ? (
          <TabsContent value="bookmarks">
            {bookmarks.items.length === 0 ? (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <Bookmark className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t.noBookmarks}
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {bookmarks.items.map((seconds) => (
                  <li key={seconds} className="flex items-center gap-2 px-4 py-2">
                    <button
                      type="button"
                      onClick={() => player.current?.seek(seconds)}
                      className="min-h-8 flex-1 text-left text-sm font-medium tabular-nums text-primary hover:underline"
                    >
                      {t.jumpTo(formatClock(seconds))}
                    </button>
                    {tutor ? (
                      <Button size="sm" variant="ghost" onClick={() => tutor.focus(seconds)}>
                        {t.askAt(formatClock(seconds))}
                      </Button>
                    ) : null}
                    <Button size="icon-sm" variant="ghost" aria-label={`${t.removeBookmark} ${formatClock(seconds)}`} onClick={() => bookmarks.remove(seconds)}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        ) : null}
      </Tabs>

      <nav className="flex items-center justify-between gap-3 border-t border-border pt-4" aria-label={t.lessons}>
        {data.previous ? (
          <Link href={`/learn/courses/${data.course.slug}/lessons/${data.previous.slug}`} className={cn(buttonVariants({ variant: "ghost" }), "max-w-[45%]")}>
            <ChevronLeft />
            <span className="truncate">
              <span className="sr-only">{t.previous}: </span>
              {data.previous.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {data.next ? (
          <Link href={`/learn/courses/${data.course.slug}/lessons/${data.next.slug}`} className={cn(buttonVariants({ variant: "outline" }), "max-w-[55%]")}>
            <span className="truncate">
              <span className="sr-only">{t.next}: </span>
              {data.next.title}
            </span>
            <ChevronRight />
          </Link>
        ) : null}
      </nav>
    </div>
  );
}

function Layout({ data, locale, panel }: Props & { panel: React.ReactNode }) {
  const t = copy[locale];
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const nav = (onNavigate?: () => void) => (
    <CurriculumNav
      courseTitle={data.course.title}
      courseSlug={data.course.slug}
      groups={data.groups}
      currentSlug={data.lesson.slug}
      completedCount={data.completedCount}
      totalCount={data.totalCount}
      locale={locale}
      onNavigate={onNavigate}
    />
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:shadow-panel"
      >
        {t.skip}
      </a>
      <header className="sticky top-0 z-header flex h-header items-center gap-2 border-b border-border bg-card px-3 md:px-4">
        <Link href={`/learn/courses/${data.course.slug}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0")}>
          <ArrowLeft />
          <span className="hidden sm:inline">{t.back}</span>
        </Link>
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0 lg:hidden">
              <ListTree />
              {t.lessons}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" title={t.lessons} hideTitle>
            {nav(() => setDrawerOpen(false))}
          </SheetContent>
        </Sheet>
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">{data.course.title}</span>
          <span className="hidden text-muted-foreground md:inline"> · {data.lesson.title}</span>
        </p>
      </header>

      {data.mode !== "student" ? <LessonModeBanner mode={data.mode} locale={locale} /> : null}

      <div className="flex min-h-0 flex-1">
        <aside className="sticky top-header hidden h-[calc(100vh-var(--header-height))] w-72 shrink-0 overflow-y-auto border-r border-border bg-card p-4 lg:block">
          {nav()}
        </aside>
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 pb-24 focus:outline-none xl:pb-6">
          <LessonContent data={data} locale={locale} />
        </main>
        {panel}
      </div>
    </div>
  );
}

/**
 * The ERA digital classroom: course navigation, the lesson, and ERA Tutor side by side.
 * The tutor is mounted only in Student Lesson Mode. Teacher Preview and Admin inspection never
 * enable it (docs/ERA_DESIGN_SYSTEM.md §7).
 */
export function Classroom({ data, locale }: Props) {
  // Keyed by lesson: moving to another lesson starts with fresh player, progress and tutor state.
  return (
    <PlayerProvider key={data.lesson.id}>
      {data.mode === "student" ? (
        <ClassroomTutor lessonId={data.lesson.id} courseTitle={data.course.title} lessonTitle={data.lesson.title} locale={locale}>
          {(panel) => <Layout data={data} locale={locale} panel={panel} />}
        </ClassroomTutor>
      ) : (
        <Layout data={data} locale={locale} panel={null} />
      )}
    </PlayerProvider>
  );
}
