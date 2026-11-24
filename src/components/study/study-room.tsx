"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpenText,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Languages,
  Loader2,
  MessageCircleQuestion,
  Send,
  Sparkles,
  Target,
  XCircle,
  Zap
} from "lucide-react";

import { TutorMarkdown } from "@/components/classroom/tutor-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PublicQuestion, PublicStudyContent, StudyLanguage } from "@/server/study/content";

/*
 * Lesson study room (docs/ERA_STUDY_ROOM.md). Left: the full lesson, section by section, with short checkpoints.
 * Right: Summary · Ask a question · Test yourself. On phones a tab bar switches between the lesson and the three
 * tabs. Correct answers come from the server only after the student answers.
 */

type Progress = Record<string, { correct: boolean | null; score: number | null }>;
type Tab = "summary" | "ask" | "test";

const COPY = {
  uz: {
    back: "Darsga qaytish",
    contents: "Mundarija",
    lesson: "Dars",
    summary: "Xulosa",
    ask: "Savol berish",
    test: "O'zingizni sinang",
    preview: "Ko'rib chiqish rejimi: bu qoralama, o'quvchilar uni nashr qilingandan keyin ko'radi.",
    briefing: "Dars haqida qisqacha",
    outcomes: "Nimalarni o'rganasiz",
    keyPoints: "Asosiy fikrlar",
    keyTerms: "Muhim atamalar",
    checkpoint: "Tekshiruv nuqtasi",
    check: "Tekshirish",
    correct: "To'g'ri!",
    wrong: "Noto'g'ri",
    rightAnswer: "To'g'ri javob",
    answeredBefore: "Avval javob bergansiz",
    askIntro: "Tushunmagan joyingizni yozing — ERA shu dars asosida tushuntiradi. Matndan biror joyni belgilab, \"Shu haqida so'rash\"ni ham bosishingiz mumkin.",
    askPlaceholder: "Masalan: normalizatsiya nima uchun kerak?",
    askAbout: "Shu haqida so'rash",
    selected: "Belgilangan matn",
    thinking: "ERA o'ylayapti…",
    fromCache: "Tezkor javob",
    sources: "Manba",
    suggestions: "Masalan:",
    whatIs: (term: string) => `${term} nima?`,
    all: "Hammasi",
    easy: "Oson",
    medium: "O'rta",
    advanced: "Qiyin (intervyu)",
    yourAnswer: "Javobingizni yozing…",
    submit: "Javob berish",
    score: "Ball",
    followUp: "Qo'shimcha savol (intervyu)",
    modelAnswer: "Namunaviy javob",
    review: "Takrorlash uchun",
    done: (done: number, total: number) => `${done}/${total} ta savolga javob berdingiz`,
    error: "Xatolik yuz berdi. Qayta urinib ko'ring.",
    noQuestions: "Bu darajada savollar yo'q."
  },
  en: {
    back: "Back to the lesson",
    contents: "Contents",
    lesson: "Lesson",
    summary: "Summary",
    ask: "Ask a question",
    test: "Test yourself",
    preview: "Preview: this is a draft. Students see it after it is published.",
    briefing: "Lesson briefing",
    outcomes: "What you will learn",
    keyPoints: "Key points",
    keyTerms: "Key terms",
    checkpoint: "Checkpoint",
    check: "Check",
    correct: "Correct!",
    wrong: "Not quite",
    rightAnswer: "Right answer",
    answeredBefore: "You answered this before",
    askIntro: "Write what you didn't understand — ERA explains it from this lesson. You can also select text in the lesson and press \"Ask about this\".",
    askPlaceholder: "e.g. Why do we need normalization?",
    askAbout: "Ask about this",
    selected: "Selected text",
    thinking: "ERA is thinking…",
    fromCache: "Instant answer",
    sources: "Source",
    suggestions: "Try:",
    whatIs: (term: string) => `What is ${term}?`,
    all: "All",
    easy: "Easy",
    medium: "Medium",
    advanced: "Advanced (interview)",
    yourAnswer: "Write your answer…",
    submit: "Submit answer",
    score: "Score",
    followUp: "Follow-up question (interview)",
    modelAnswer: "Model answer",
    review: "To review",
    done: (done: number, total: number) => `You answered ${done} of ${total} questions`,
    error: "Something went wrong. Please try again.",
    noQuestions: "No questions at this level."
  }
} as const;

type Copy = (typeof COPY)[StudyLanguage];

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json().catch(() => null)) as ({ ok?: boolean; error?: string; message?: string } & T) | null;
  if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? payload?.error ?? "");
  return payload;
}

// ------------------------------------------------------------------------------------------------

function ChoiceQuestion({ question, lessonId, language, t, previous, onAnswered }: { question: PublicQuestion; lessonId: string; language: StudyLanguage; t: Copy; previous?: Progress[string]; onAnswered: (correct: boolean) => void }) {
  const [choice, setChoice] = React.useState<number | null>(null);
  const [result, setResult] = React.useState<{ correct: boolean; correctIndex: number | null; explanation: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  async function check() {
    if (choice === null) return;
    setBusy(true);
    setError("");
    try {
      const data = await postJson<{ correct: boolean; correctIndex: number | null; explanation: string }>(`/api/learn/study/${lessonId}/answer`, { questionId: question.id, choice, language });
      setResult(data);
      onAnswered(data.correct);
    } catch (caught) {
      setError((caught as Error).message || t.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium leading-6">{question.prompt}</legend>
      {previous && !result ? <span className="text-xs text-muted-foreground">✓ {t.answeredBefore}</span> : null}
      <div className="flex flex-col gap-1.5" role="radiogroup">
        {question.options.map((option, index) => {
          const isRight = result && result.correctIndex === index;
          const isWrongPick = result && !result.correct && choice === index;
          return (
            <label
              key={index}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                result ? "cursor-default" : "hover:bg-muted/60",
                choice === index && !result ? "border-primary bg-primary/5" : "border-border",
                isRight ? "border-success bg-success/10" : "",
                isWrongPick ? "border-error bg-error/10" : ""
              )}
            >
              <input type="radio" name={`q-${question.id}`} className="mt-1 accent-primary" disabled={Boolean(result)} checked={choice === index} onChange={() => setChoice(index)} />
              <span>{option}</span>
            </label>
          );
        })}
      </div>
      {result ? (
        <div className={cn("rounded-lg px-3 py-2 text-sm", result.correct ? "bg-success/10" : "bg-error/10")} role="status">
          <p className="flex items-center gap-1.5 font-semibold">
            {result.correct ? <CheckCircle2 className="size-4 text-success" aria-hidden="true" /> : <XCircle className="size-4 text-error" aria-hidden="true" />}
            {result.correct ? t.correct : t.wrong}
          </p>
          {result.explanation ? <p className="mt-1 text-muted-foreground">{result.explanation}</p> : null}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={check} disabled={choice === null || busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {t.check}
          </Button>
          {error ? <span className="text-xs text-error">{error}</span> : null}
        </div>
      )}
    </fieldset>
  );
}

function OpenQuestion({ question, lessonId, language, t, previous, onAnswered }: { question: PublicQuestion; lessonId: string; language: StudyLanguage; t: Copy; previous?: Progress[string]; onAnswered: () => void }) {
  const [answer, setAnswer] = React.useState("");
  const [first, setFirst] = React.useState<{ score: number; feedback: string; followUp: string; modelAnswer: string; explanation: string } | null>(null);
  const [followAnswer, setFollowAnswer] = React.useState("");
  const [second, setSecond] = React.useState<{ score: number; feedback: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  async function submit(followUp: string | null) {
    setBusy(true);
    setError("");
    try {
      const data = await postJson<{ score: number; feedback: string; followUp: string; modelAnswer: string; explanation: string }>(`/api/learn/study/${lessonId}/answer`, {
        questionId: question.id,
        answer: followUp ? followAnswer : answer,
        followUp,
        language
      });
      if (followUp) setSecond(data);
      else {
        setFirst(data);
        onAnswered();
      }
    } catch (caught) {
      setError((caught as Error).message || t.error);
    } finally {
      setBusy(false);
    }
  }

  const scoreBadge = (score: number) => (
    <Badge variant={score >= 70 ? "success" : score >= 40 ? "warning" : "error"}>
      {t.score}: {score}/100
    </Badge>
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium leading-6">{question.prompt}</p>
      {previous?.score !== null && previous?.score !== undefined && !first ? <span className="text-xs text-muted-foreground">✓ {t.answeredBefore} · {t.score}: {previous.score}/100</span> : null}
      {!first ? (
        <>
          <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={4} maxLength={4000} placeholder={t.yourAnswer} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => submit(null)} disabled={answer.trim().length < 3 || busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />}
              {t.submit}
            </Button>
            {error ? <span className="text-xs text-error">{error}</span> : null}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm" role="status">
          <div>{scoreBadge(first.score)}</div>
          <p>{first.feedback}</p>
          {first.followUp && !second ? (
            <div className="flex flex-col gap-2 border-t border-border pt-2">
              <p className="font-medium">
                <Target className="mr-1 inline size-4 text-primary" aria-hidden="true" />
                {t.followUp}: {first.followUp}
              </p>
              <textarea value={followAnswer} onChange={(event) => setFollowAnswer(event.target.value)} rows={3} maxLength={4000} placeholder={t.yourAnswer} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => submit(first.followUp)} disabled={followAnswer.trim().length < 3 || busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <Send />}
                  {t.submit}
                </Button>
                {error ? <span className="text-xs text-error">{error}</span> : null}
              </div>
            </div>
          ) : null}
          {second ? (
            <div className="flex flex-col gap-1 border-t border-border pt-2">
              <div>{scoreBadge(second.score)}</div>
              <p>{second.feedback}</p>
            </div>
          ) : null}
          {first.modelAnswer || first.explanation ? (
            <details className="border-t border-border pt-2">
              <summary className="cursor-pointer text-xs font-semibold text-primary">{t.modelAnswer}</summary>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{first.modelAnswer || first.explanation}</p>
            </details>
          ) : null}
        </div>
      )}
    </div>
  );
}

function QuestionBlock(props: { question: PublicQuestion; lessonId: string; language: StudyLanguage; t: Copy; previous?: Progress[string]; onAnswered: (id: string, correct: boolean | null) => void }) {
  return props.question.kind === "choice" ? (
    <ChoiceQuestion {...props} onAnswered={(correct) => props.onAnswered(props.question.id, correct)} />
  ) : (
    <OpenQuestion {...props} onAnswered={() => props.onAnswered(props.question.id, null)} />
  );
}

// ------------------------------------------------------------------------------------------------

type Message = { role: "user" | "assistant"; text: string; selection?: string; cached?: boolean; sources?: string[]; error?: boolean };

function AskPanel({ lessonId, language, t, content, selection, clearSelection }: { lessonId: string; language: StudyLanguage; t: Copy; content: PublicStudyContent; selection: string; clearSelection: () => void }) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [question, setQuestion] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function ask(text: string) {
    const value = text.trim();
    if (value.length < 2 || busy) return;
    const usedSelection = selection;
    setMessages((current) => [...current, { role: "user", text: value, selection: usedSelection || undefined }]);
    setQuestion("");
    clearSelection();
    setBusy(true);
    try {
      const data = await postJson<{ answer: string; sources: string[]; cached: boolean }>(`/api/learn/study/${lessonId}/ask`, { question: value, selection: usedSelection || null, language });
      setMessages((current) => [...current, { role: "assistant", text: data.answer, cached: data.cached, sources: data.sources }]);
    } catch (caught) {
      setMessages((current) => [...current, { role: "assistant", text: (caught as Error).message || t.error, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {!messages.length ? (
          <div className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>{t.askIntro}</p>
            {content.keyTerms.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs">{t.suggestions}</span>
                {content.keyTerms.slice(0, 4).map((term) => (
                  <button key={term.term} type="button" onClick={() => ask(t.whatIs(term.term))} className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary hover:bg-primary/10">
                    {t.whatIs(term.term)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {messages.map((message, index) =>
          message.role === "user" ? (
            <div key={index} className="ml-6 flex flex-col gap-1 self-end rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground">
              {message.selection ? <span className="line-clamp-2 border-l-2 border-primary-foreground/50 pl-2 text-xs opacity-80">{message.selection}</span> : null}
              <span className="whitespace-pre-wrap">{message.text}</span>
            </div>
          ) : (
            <div key={index} className={cn("mr-2 flex flex-col gap-2 rounded-xl border px-3 py-2 text-sm", message.error ? "border-error/30 bg-error/5 text-error" : "border-border bg-card")}>
              {message.error ? <p>{message.text}</p> : <TutorMarkdown text={message.text} locale={language} />}
              {message.cached || message.sources?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {message.cached ? (
                    <Badge variant="outline">
                      <Zap className="size-3" aria-hidden="true" />
                      {t.fromCache}
                    </Badge>
                  ) : null}
                  {message.sources?.map((source) => (
                    <Badge key={source} variant="neutral">
                      {t.sources}: {source}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          )
        )}
        {busy ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t.thinking}
          </p>
        ) : null}
        <div ref={endRef} />
      </div>
      <form
        className="flex flex-col gap-2 border-t border-border pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        {selection ? (
          <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2 py-1.5 text-xs">
            <span className="line-clamp-3 flex-1">
              <strong>{t.selected}:</strong> {selection}
            </span>
            <button type="button" onClick={clearSelection} aria-label="✕" className="text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(question);
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder={t.askPlaceholder}
            aria-label={t.ask}
            className="min-h-[44px] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="submit" size="icon" disabled={question.trim().length < 2 || busy} aria-label={t.ask}>
            <Send />
          </Button>
        </div>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------

export function StudyRoom({
  lessonId,
  lessonTitle,
  courseTitle,
  backHref,
  language,
  englishAvailable,
  preview,
  content,
  progress: initialProgress
}: {
  lessonId: string;
  lessonTitle: string;
  courseTitle: string;
  backHref: string;
  language: StudyLanguage;
  englishAvailable: boolean;
  preview: boolean;
  content: PublicStudyContent;
  progress: Progress;
}) {
  const t = COPY[language];
  const [tab, setTab] = React.useState<Tab>("summary");
  const [mobileView, setMobileView] = React.useState<"lesson" | "panel">("lesson");
  const [selection, setSelection] = React.useState("");
  const [floating, setFloating] = React.useState<{ x: number; y: number; text: string } | null>(null);
  const [progress, setProgress] = React.useState<Progress>(initialProgress);
  const [level, setLevel] = React.useState<"ALL" | "EASY" | "MEDIUM" | "ADVANCED">("ALL");
  const articleRef = React.useRef<HTMLElement>(null);

  // Remember the language the student studies in.
  React.useEffect(() => {
    document.cookie = `era_study_lang=${language}; path=/; max-age=31536000; samesite=lax`;
  }, [language]);

  const markAnswered = React.useCallback((id: string, correct: boolean | null) => {
    setProgress((current) => ({ ...current, [id]: { correct, score: current[id]?.score ?? null } }));
  }, []);

  // Select text in the lesson → "Ask about this".
  React.useEffect(() => {
    function onUp() {
      const selected = window.getSelection();
      const text = selected?.toString().trim() ?? "";
      if (!selected || text.length < 3 || !articleRef.current || !selected.anchorNode || !articleRef.current.contains(selected.anchorNode)) {
        setFloating(null);
        return;
      }
      const rect = selected.getRangeAt(0).getBoundingClientRect();
      setFloating({ x: Math.min(rect.left + rect.width / 2, window.innerWidth - 90), y: Math.max(rect.top - 44, 8), text: text.slice(0, 2000) });
    }
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
    };
  }, []);

  function openTab(next: Tab) {
    setTab(next);
    setMobileView("panel");
  }

  const allQuestions = content.questions;
  const shown = level === "ALL" ? allQuestions : allQuestions.filter((question) => question.level === level);
  const answered = allQuestions.filter((question) => progress[question.id]).length;
  const levelLabel = { EASY: t.easy, MEDIUM: t.medium, ADVANCED: t.advanced } as const;
  const langHref = (next: StudyLanguage) => `?lang=${next}`;

  const tabs: Array<{ value: Tab; label: string; icon: React.ReactNode }> = [
    { value: "summary", label: t.summary, icon: <Sparkles className="size-4" aria-hidden="true" /> },
    { value: "ask", label: t.ask, icon: <MessageCircleQuestion className="size-4" aria-hidden="true" /> },
    { value: "test", label: t.test, icon: <ClipboardCheck className="size-4" aria-hidden="true" /> }
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t.back}
        </Link>
        <div className="inline-flex items-center gap-1 rounded-full border border-border p-0.5 text-xs" role="group" aria-label="Language">
          <Languages className="ml-1.5 size-3.5 text-muted-foreground" aria-hidden="true" />
          <Link href={langHref("uz")} aria-current={language === "uz" ? "true" : undefined} className={cn("rounded-full px-2.5 py-1", language === "uz" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
            O&apos;zbekcha
          </Link>
          {englishAvailable ? (
            <Link href={langHref("en")} aria-current={language === "en" ? "true" : undefined} className={cn("rounded-full px-2.5 py-1", language === "en" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              English
            </Link>
          ) : null}
        </div>
      </div>

      {preview ? <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{t.preview}</p> : null}

      {/* Phones: one view at a time. */}
      <nav className="sticky top-0 z-20 -mx-1 flex gap-1 overflow-x-auto bg-background/95 px-1 py-1 backdrop-blur lg:hidden" aria-label={t.contents}>
        <button type="button" onClick={() => setMobileView("lesson")} className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm", mobileView === "lesson" ? "bg-primary text-primary-foreground" : "bg-muted")}>
          <BookOpenText className="size-4" aria-hidden="true" />
          {t.lesson}
        </button>
        {tabs.map((item) => (
          <button key={item.value} type="button" onClick={() => openTab(item.value)} className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm", mobileView === "panel" && tab === item.value ? "bg-primary text-primary-foreground" : "bg-muted")}>
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <article ref={articleRef} className={cn("min-w-0 flex-col gap-6", mobileView === "lesson" ? "flex" : "hidden lg:flex")} aria-label={lessonTitle}>
          <header className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">{courseTitle}</p>
            <h1 className="page-title">{content.title || lessonTitle}</h1>
          </header>

          <details className="rounded-xl border border-border bg-card">
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">{t.contents}</summary>
            <ol className="flex flex-col gap-1 border-t border-border px-4 py-3 text-sm">
              {content.sections.map((section, index) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="flex items-center gap-1 text-primary hover:underline">
                    <ChevronRight className="size-3.5" aria-hidden="true" />
                    {index + 1}. {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </details>

          {content.sections.map((section, index) => (
            <section key={section.id} id={section.id} className="flex scroll-mt-20 flex-col gap-4">
              <h2 className="text-xl font-semibold leading-snug">
                {index + 1}. {section.title}
              </h2>
              <div className="text-[0.95rem] leading-7">
                <TutorMarkdown text={section.body} locale={language} />
              </div>
              {section.checkpoint.length ? (
                <aside className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4" aria-label={t.checkpoint}>
                  <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <ClipboardCheck className="size-4" aria-hidden="true" />
                    {t.checkpoint}
                  </p>
                  {section.checkpoint.map((question) => (
                    <QuestionBlock key={question.id} question={question} lessonId={lessonId} language={language} t={t} previous={progress[question.id]} onAnswered={markAnswered} />
                  ))}
                </aside>
              ) : null}
            </section>
          ))}
        </article>

        <aside className={cn("min-w-0 flex-col lg:sticky lg:top-4 lg:flex lg:h-[calc(100vh-6rem)]", mobileView === "panel" ? "flex" : "hidden")} aria-label={t.summary}>
          <div className="flex h-full min-h-[70vh] flex-col overflow-hidden rounded-xl border border-border bg-card lg:min-h-0">
            <div className="hidden border-b border-border lg:flex" role="tablist">
              {tabs.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.value}
                  onClick={() => setTab(item.value)}
                  className={cn("flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-sm font-medium", tab === item.value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4" role="tabpanel">
              {tab === "summary" ? (
                <div className="flex flex-col gap-5 text-sm">
                  <section className="flex flex-col gap-1.5">
                    <h3 className="text-base font-semibold">{t.briefing}</h3>
                    <p className="leading-6 text-muted-foreground">{content.briefing}</p>
                  </section>
                  {content.outcomes.length ? (
                    <section className="flex flex-col gap-1.5">
                      <h3 className="font-semibold">{t.outcomes}</h3>
                      <ul className="flex list-disc flex-col gap-1 pl-5 leading-6">
                        {content.outcomes.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                  {content.keyPoints.length ? (
                    <section className="flex flex-col gap-1.5">
                      <h3 className="font-semibold">{t.keyPoints}</h3>
                      <ul className="flex list-disc flex-col gap-1 pl-5 leading-6">
                        {content.keyPoints.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                  {content.keyTerms.length ? (
                    <section className="flex flex-col gap-1.5">
                      <h3 className="font-semibold">{t.keyTerms}</h3>
                      <dl className="flex flex-col gap-2">
                        {content.keyTerms.map((term) => (
                          <div key={term.term} className="rounded-lg bg-muted/50 px-3 py-2">
                            <dt className="font-medium">{term.term}</dt>
                            <dd className="text-muted-foreground">{term.definition}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ) : null}
                </div>
              ) : tab === "ask" ? (
                <AskPanel lessonId={lessonId} language={language} t={t} content={content} selection={selection} clearSelection={() => setSelection("")} />
              ) : (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-muted-foreground" role="status">
                    {t.done(answered, allQuestions.length)}
                  </p>
                  <div className="flex flex-wrap gap-1.5" role="group">
                    {(["ALL", "EASY", "MEDIUM", "ADVANCED"] as const).map((value) => {
                      const count = value === "ALL" ? allQuestions.length : allQuestions.filter((question) => question.level === value).length;
                      return (
                        <button key={value} type="button" onClick={() => setLevel(value)} aria-pressed={level === value} className={cn("rounded-full border px-3 py-1 text-xs font-medium", level === value ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>
                          {value === "ALL" ? t.all : levelLabel[value]} ({count})
                        </button>
                      );
                    })}
                  </div>
                  {shown.length ? (
                    <ol className="flex flex-col gap-4">
                      {shown.map((question, index) => (
                        <li key={question.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            {index + 1}.
                            <Badge variant={question.level === "EASY" ? "success" : question.level === "MEDIUM" ? "warning" : "primary"}>{levelLabel[question.level as "EASY" | "MEDIUM" | "ADVANCED"] ?? question.level}</Badge>
                          </span>
                          <QuestionBlock question={question} lessonId={lessonId} language={language} t={t} previous={progress[question.id]} onAnswered={markAnswered} />
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t.noQuestions}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {floating ? (
        <button
          type="button"
          style={{ left: floating.x, top: floating.y }}
          className="fixed z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-lg"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setSelection(floating.text);
            setFloating(null);
            window.getSelection()?.removeAllRanges();
            openTab("ask");
          }}
        >
          <MessageCircleQuestion className="size-3.5" aria-hidden="true" />
          {t.askAbout}
        </button>
      ) : null}
    </div>
  );
}
