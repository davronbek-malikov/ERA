"use client";

import * as React from "react";
import { BookOpen } from "lucide-react";

import { AssistantComposer } from "@/components/assistant/assistant-composer";
import { AssistantMessage } from "@/components/assistant/assistant-message";
import { AssistantPanel, privacyNote } from "@/components/assistant/assistant-panel";
import { AssistantStatus, type AssistantState } from "@/components/assistant/assistant-status";
import { SourceList } from "@/components/assistant/source-list";
import type { AssistantContextChip } from "@/components/assistant/types";
import { usePlayerHandle } from "@/components/classroom/player-context";
import { TutorMarkdown } from "@/components/classroom/tutor-markdown";
import { Skeleton } from "@/components/ui/feedback";
import { toast } from "@/components/ui/toast";
import { AgentStreamFailure } from "@/lib/ai/agent-stream";
import { askEraBubble, type AskEraSelectionPayload } from "@/lib/ai/ask-era";
import { formatClock, loadTutorHistory, streamTutor, type TutorMessage } from "@/lib/era/tutor-client";
import type { Locale } from "@/lib/i18n";

const copy = {
  en: {
    intro: "Your personal learning assistant. Ask anything about this lesson, at any moment of the video.",
    suggestions: ["Explain this concept", "What does this notation mean?", "Give me a simple example", "Explain in Uzbek", "Why is this formula important?"],
    followUps: ["Explain more simply", "Give another example", "Show the steps", "Test my understanding"],
    thisMoment: (time: string) => `at ${time}`,
    answerNote: "ERA answers from this lesson's notes first. If something doesn't match what your teacher said, ask your teacher.",
    loadingHistory: "Loading your conversation",
    historyError: "Your earlier messages couldn't load. You can still ask a new question.",
    signIn: "Sign in again to use ERA Tutor.",
    stopped: "Stopped. This answer wasn't saved.",
    interrupted: "The answer was interrupted and wasn't saved. Try again.",
    answered: "ERA Tutor answered.",
    attachUnavailable: "Image attachments aren't available yet.",
    voiceUnavailable: "Voice questions aren't available yet."
  },
  uz: {
    intro: "Shaxsiy o'quv yordamchingiz. Video istalgan lahzasida shu dars bo'yicha savol bering.",
    suggestions: ["Bu tushunchani tushuntiring", "Bu belgi nimani anglatadi?", "Oddiy misol keltiring", "O'zbek tilida tushuntiring", "Bu formula nega muhim?"],
    followUps: ["Soddaroq tushuntiring", "Yana bir misol", "Qadamlarni ko'rsating", "Tushunganimni tekshiring"],
    thisMoment: (time: string) => `${time} da`,
    answerNote: "ERA avval shu dars izohlariga tayanadi. Agar o'qituvchingiz aytganiga mos kelmasa, o'qituvchingizdan so'rang.",
    loadingHistory: "Suhbatingiz yuklanmoqda",
    historyError: "Oldingi xabarlaringiz yuklanmadi. Baribir yangi savol berishingiz mumkin.",
    signIn: "ERA Tutordan foydalanish uchun qayta kiring.",
    stopped: "To'xtatildi. Bu javob saqlanmadi.",
    interrupted: "Javob uzilib qoldi va saqlanmadi. Qayta urinib ko'ring.",
    answered: "ERA Tutor javob berdi.",
    attachUnavailable: "Rasm biriktirish hozircha mavjud emas.",
    voiceUnavailable: "Ovozli savollar hozircha mavjud emas."
  }
};

export type TutorApi = {
  /** Send a question, optionally tied to a moment in the video. Opens the tutor. */
  ask: (question: string, seconds?: number | null) => void;
  /** Open the tutor and put the cursor in the input. */
  focus: (seconds?: number | null) => void;
  /** Ask ERA AI: send a highlighted passage from this lesson into the same tutor conversation. */
  askSelection: (selection: AskEraSelectionPayload) => void;
};

const TutorApiContext = React.createContext<TutorApi | null>(null);
export const useTutorApi = () => React.useContext(TutorApiContext);

type ClassroomTutorProps = {
  lessonId: string;
  courseTitle: string;
  lessonTitle: string;
  locale: Locale;
  /** Lays out the page; receives the tutor panel to place beside the content. */
  children: (panel: React.ReactNode) => React.ReactNode;
};

type UiMessage = TutorMessage & { momentSeconds?: number };

export function ClassroomTutor({ lessonId, courseTitle, lessonTitle, locale, children }: ClassroomTutorProps) {
  const t = copy[locale];
  const player = usePlayerHandle();
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<UiMessage[]>([]);
  const [history, setHistory] = React.useState<"loading" | "ready" | "error">("loading");
  const [moment, setMoment] = React.useState<number | null>(null);
  const [status, setStatus] = React.useState<AssistantState | null>(null);
  /** The answer being streamed right now (not saved until the server confirms). */
  const [streaming, setStreaming] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const abort = React.useRef<AbortController | null>(null);
  const composerRef = React.useRef<HTMLTextAreaElement>(null);
  const listEnd = React.useRef<HTMLDivElement>(null);

  // Wide screens: docked open, or as the student last left it. Narrower screens always start closed,
  // so the overlay or bottom sheet never covers the video until the student asks.
  React.useEffect(() => {
    if (!window.matchMedia("(min-width: 1280px)").matches) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem("era:tutor-open");
    } catch {}
    setOpen(stored !== "0");
  }, []);

  function changeOpen(next: boolean) {
    setOpen(next);
    try {
      window.localStorage.setItem("era:tutor-open", next ? "1" : "0");
    } catch {}
  }

  React.useEffect(() => {
    let cancelled = false;
    loadTutorHistory(lessonId)
      .then((loaded) => {
        if (!cancelled) {
          setMessages(loaded);
          setHistory("ready");
        }
      })
      .catch(() => !cancelled && setHistory("error"));
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  React.useEffect(() => {
    listEnd.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, status, streaming]);

  const send = React.useCallback(
    async (question: string, seconds: number | null, selection?: AskEraSelectionPayload) => {
      const controller = new AbortController();
      abort.current = controller;
      const optimistic: UiMessage = {
        id: `local-${Date.now()}`,
        role: "USER",
        content: question,
        createdAt: new Date().toISOString(),
        momentSeconds: seconds ?? undefined
      };
      setMessages((current) => [...current, optimistic]);
      setMoment(null);
      setStatus({ state: "thinking" });
      setStreaming(null);
      const removeOptimistic = () => setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      try {
        const saved = await streamTutor({ lessonId, question, selection, timestampSeconds: seconds ?? undefined }, controller.signal, {
          onDelta: (text) => {
            setStatus(null);
            setStreaming((current) => (current ?? "") + text);
          },
          onReset: () => setStreaming("")
        });
        const answer = saved.find((message) => message.role === "ASSISTANT");
        const asked = saved.find((message) => message.role === "USER");
        setMessages((current) => [
          ...current.filter((message) => message.id !== optimistic.id),
          { ...optimistic, id: asked?.id ?? optimistic.id },
          ...(answer ? [answer] : [])
        ]);
        setStreaming(null);
        setStatus(null);
        setAnnouncement(`${t.answered} ${answer?.content.slice(0, 140) ?? ""}`);
      } catch (error) {
        setStreaming(null);
        // Nothing was saved for a failed or stopped answer, so the question leaves the thread too.
        removeOptimistic();
        const detail = error instanceof AgentStreamFailure ? error.detail : { kind: "error" as const, message: "" };
        if (detail.kind === "cancelled") {
          setStatus(null);
          return;
        }
        if (detail.kind === "rate-limited") setStatus({ state: "rate-limited", retryAfterSeconds: detail.retryAfterSeconds });
        else if (detail.kind === "limit-reached") {
          const midnightUtc = new Date();
          midnightUtc.setUTCHours(24, 0, 0, 0);
          setStatus({ state: "quota-reached", resetsAt: midnightUtc.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
        } else if (detail.kind === "unavailable") setStatus({ state: "unavailable" });
        else if (detail.kind === "offline") setStatus({ state: "offline" });
        else if (detail.kind === "auth" || detail.kind === "forbidden") {
          setStatus({ state: "not-permitted" });
          if (detail.kind === "auth") toast({ title: t.signIn, variant: "error" });
        } else {
          if (detail.kind === "interrupted") toast({ title: t.interrupted, variant: "error" });
          setStatus({ state: "error", onRetry: () => void send(question, seconds, selection) });
        }
      } finally {
        if (abort.current === controller) abort.current = null;
      }
    },
    [lessonId, t]
  );

  const api = React.useMemo<TutorApi>(
    () => ({
      ask: (question, seconds) => {
        changeOpen(true);
        void send(question, seconds ?? null);
      },
      focus: (seconds) => {
        changeOpen(true);
        if (seconds !== undefined && seconds !== null) setMoment(seconds);
        window.setTimeout(() => composerRef.current?.focus(), 50);
      },
      askSelection: (selection) => {
        changeOpen(true);
        void send(askEraBubble({ ...selection, selectedText: selection.selectedText }, locale === "uz" ? "uz" : "en"), null, selection);
      }
    }),
    [send, locale]
  );

  function stop() {
    abort.current?.abort();
    abort.current = null;
    setStatus(null);
    setAnnouncement(t.stopped);
    toast({ title: t.stopped });
  }

  const chips: AssistantContextChip[] = moment !== null ? [{ id: "moment", kind: "timestamp", label: formatClock(moment), removable: true }] : [];
  const lastAnswerIndex = messages.map((message) => message.role).lastIndexOf("ASSISTANT");
  const seek = player.current?.hasTimeline ? (seconds: number) => player.current?.seek(seconds) : undefined;
  const generating = status?.state === "thinking" || streaming !== null;

  const panel = (
    <AssistantPanel
      kind="student-tutor"
      locale={locale}
      open={open}
      onOpenChange={changeOpen}
      announcement={announcement}
      mobileLauncherOffset="default"
      contextChips={[
        { id: "course", kind: "course", label: courseTitle },
        { id: "lesson", kind: "lesson", label: lessonTitle }
      ]}
      composer={
        <AssistantComposer
          ref={composerRef}
          locale={locale}
          chips={chips}
          onRemoveChip={() => setMoment(null)}
          onSubmit={(question) => void send(question, moment)}
          generating={generating}
          onStop={stop}
          enabledAttachments={["image"]}
          onAttachRequest={() => toast({ title: t.attachUnavailable })}
          onVoiceRequest={() => toast({ title: t.voiceUnavailable })}
          footnote={privacyNote("student-tutor", locale)}
        />
      }
    >
      <p className="text-sm text-muted-foreground">{t.intro}</p>

      {history === "loading" ? (
        <div className="flex flex-col gap-2" role="status" aria-label={t.loadingHistory}>
          <Skeleton className="ml-auto h-8 w-2/3 rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : history === "error" ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{t.historyError}</p>
      ) : null}

      {history !== "loading" && messages.length === 0 && !status ? (
        <ul className="flex flex-wrap gap-2" aria-label="Suggested questions">
          {t.suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => void send(suggestion, player.current?.getTime() ?? null)}
                className="min-h-8 rounded-lg border border-border bg-surface px-3 py-1.5 text-left text-sm hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {messages.map((message, index) =>
        message.role === "USER" ? (
          <AssistantMessage key={message.id} role="user">
            {message.content}
            {message.momentSeconds !== undefined ? (
              <span className="mt-1 block text-xs text-muted-foreground">{t.thisMoment(formatClock(message.momentSeconds))}</span>
            ) : null}
          </AssistantMessage>
        ) : (
          <AssistantMessage key={message.id} role="assistant" assistantName="ERA Tutor">
            <div className="flex flex-col gap-3">
              <TutorMarkdown text={message.content} locale={locale} onSeek={seek} />
              <SourceList sources={message.sources} heading={locale === "uz" ? "Manbalar" : "Sources"} />
              <p className="text-xs text-muted-foreground">{t.answerNote}</p>
              {index === lastAnswerIndex && !status ? (
                <ul className="flex flex-wrap gap-1.5" aria-label="Follow-up">
                  {t.followUps.map((followUp) => (
                    <li key={followUp}>
                      <button
                        type="button"
                        onClick={() => void send(followUp, null)}
                        className="min-h-7 rounded-full border border-border px-2.5 py-1 text-xs hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {followUp}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </AssistantMessage>
        )
      )}

      {streaming !== null ? (
        <AssistantMessage role="assistant" assistantName="ERA Tutor">
          <div aria-busy="true">
            <TutorMarkdown text={streaming || "…"} locale={locale} onSeek={seek} />
          </div>
        </AssistantMessage>
      ) : null}

      {status ? <AssistantStatus status={status} locale={locale} /> : null}
      <div ref={listEnd} />
    </AssistantPanel>
  );

  return (
    <TutorApiContext.Provider value={api}>{children(panel)}</TutorApiContext.Provider>
  );
}
