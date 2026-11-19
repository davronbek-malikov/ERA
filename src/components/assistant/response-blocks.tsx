"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen, Check, Copy, Lightbulb, PlayCircle } from "lucide-react";

import type { AssistantLocaleProps, AssistantPart } from "@/components/assistant/types";
import { Alert } from "@/components/ui/feedback";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/*
 * Educational response blocks for ERA assistants. They are designed to support learning:
 * steps and hints reveal one at a time, and feedback points to what to revisit instead
 * of handing over a finished answer.
 */

const copy = {
  en: {
    concept: "Concept",
    steps: "Step by step",
    stepOf: (current: number, total: number) => `Step ${current} of ${total}`,
    tryFirst: "Try the next step yourself before revealing it.",
    nextStep: "Show next step",
    allSteps: "Show all steps",
    hint: (current: number, total: number) => `Hint ${current} of ${total}`,
    anotherHint: "Show another hint",
    example: "Example",
    formula: "Formula",
    copy: "Copy",
    copied: "Copied",
    code: "Code",
    source: "From the lesson",
    jumpTo: (time: string) => `Jump to ${time} in the video`,
    feedbackTitle: "Feedback on your attempt",
    strengths: "What you did well",
    revisit: "What to revisit",
    next: "Try next",
    guardrailTitle: "ERA helps you learn",
    guardrailBody: "ERA can explain ideas, give hints and check your thinking. It won't write graded homework answers for you."
  },
  uz: {
    concept: "Tushuncha",
    steps: "Qadamma-qadam",
    stepOf: (current: number, total: number) => `${total} qadamdan ${current}-qadam`,
    tryFirst: "Keyingi qadamni ochishdan oldin uni o'zingiz bajarib ko'ring.",
    nextStep: "Keyingi qadamni ko'rsatish",
    allSteps: "Barcha qadamlarni ko'rsatish",
    hint: (current: number, total: number) => `${total} ta maslahatdan ${current}-si`,
    anotherHint: "Yana maslahat ko'rsatish",
    example: "Misol",
    formula: "Formula",
    copy: "Nusxa olish",
    copied: "Nusxa olindi",
    code: "Kod",
    source: "Darsdan",
    jumpTo: (time: string) => `Videoda ${time} ga o'tish`,
    feedbackTitle: "Urinishingiz bo'yicha fikr",
    strengths: "Nimani yaxshi bajardingiz",
    revisit: "Nimani qayta ko'rib chiqish kerak",
    next: "Keyingi qadam",
    guardrailTitle: "ERA o'rganishingizga yordam beradi",
    guardrailBody: "ERA g'oyalarni tushuntiradi, maslahat beradi va fikrlashingizni tekshiradi. Baholanadigan uy vazifasi javoblarini siz uchun yozmaydi."
  }
};

function labels(locale: Locale = "en") {
  return copy[locale];
}

/** Formats seconds as m:ss or h:mm:ss. */
export function formatTimestamp(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function BlockLabel({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
      {icon}
      {children}
    </p>
  );
}

export function ConceptExplanation({
  title,
  summary,
  details,
  locale
}: { title: string; summary: string; details?: string[] } & AssistantLocaleProps) {
  return (
    <section className="flex flex-col gap-2">
      <BlockLabel>{labels(locale).concept}</BlockLabel>
      <h4 className="card-title">{title}</h4>
      <p className="text-sm text-foreground">{summary}</p>
      {details && details.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-foreground marker:text-muted-foreground">
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function GuidedSteps({
  title,
  steps,
  locale
}: { title?: string; steps: Array<{ title: string; body: string }> } & AssistantLocaleProps) {
  const t = labels(locale);
  const [revealed, setRevealed] = React.useState(1);
  const done = revealed >= steps.length;

  return (
    <section className="flex flex-col gap-3">
      <BlockLabel>{title ?? t.steps}</BlockLabel>
      <ol className="flex flex-col gap-3" aria-live="polite">
        {steps.slice(0, revealed).map((step, index) => (
          <li key={`${step.title}-${index}`} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-medium text-foreground">{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      {!done ? (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
          <p className="text-xs text-muted-foreground">
            {t.stepOf(revealed, steps.length)}. {t.tryFirst}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRevealed((value) => value + 1)}
              className="inline-flex h-8 items-center rounded-lg border border-input bg-surface px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t.nextStep}
            </button>
            <button
              type="button"
              onClick={() => setRevealed(steps.length)}
              className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t.allSteps}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function HintCard({ hints, locale }: { hints: string[] } & AssistantLocaleProps) {
  const t = labels(locale);
  const [revealed, setRevealed] = React.useState(1);

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
      <BlockLabel icon={<Lightbulb />}>{t.hint(revealed, hints.length)}</BlockLabel>
      <ul className="flex flex-col gap-2" aria-live="polite">
        {hints.slice(0, revealed).map((hint, index) => (
          <li key={`${hint}-${index}`} className="text-sm text-foreground">
            {hint}
          </li>
        ))}
      </ul>
      {revealed < hints.length ? (
        <button
          type="button"
          onClick={() => setRevealed((value) => value + 1)}
          className="min-h-6 self-start text-xs font-medium text-warning-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t.anotherHint}
        </button>
      ) : null}
    </section>
  );
}

export function ExampleBlock({ title, body, locale }: { title?: string; body: string } & AssistantLocaleProps) {
  return (
    <section className="flex flex-col gap-1 border-l-2 border-accent-strong pl-3">
      <BlockLabel>{title ?? labels(locale).example}</BlockLabel>
      <p className="whitespace-pre-wrap text-sm text-foreground">{body}</p>
    </section>
  );
}

/**
 * Shows a formula with an accessible spoken form. It displays the LaTeX source in a
 * monospace block for now; a math renderer can replace the inner element later without
 * changing callers (see docs/ERA_DESIGN_SYSTEM.md, remaining work).
 */
export function FormulaBlock({
  tex,
  spoken,
  caption,
  locale
}: { tex: string; spoken: string; caption?: string } & AssistantLocaleProps) {
  return (
    <figure className="flex flex-col gap-1.5">
      <BlockLabel>{labels(locale).formula}</BlockLabel>
      <div
        role="math"
        aria-label={spoken}
        data-tex={tex}
        className="overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2.5 font-mono text-sm text-foreground"
        tabIndex={0}
      >
        <span aria-hidden="true">{tex}</span>
      </div>
      {caption ? <figcaption className="text-xs text-muted-foreground">{caption}</figcaption> : null}
    </figure>
  );
}

export function CodeBlock({ language, code, locale }: { language: string; code: string } & AssistantLocaleProps) {
  const t = labels(locale);
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <figure className="overflow-hidden rounded-lg border border-border">
      <figcaption className="flex items-center justify-between border-b border-border bg-muted/60 px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">{language || t.code}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex min-h-6 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5"
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          <span aria-live="polite">{copied ? t.copied : t.copy}</span>
        </button>
      </figcaption>
      <pre className="overflow-x-auto bg-card p-3 text-[0.8125rem] leading-6" tabIndex={0}>
        <code className="font-mono">{code}</code>
      </pre>
    </figure>
  );
}

export function LessonCitation({
  lessonTitle,
  section,
  href,
  locale
}: { lessonTitle: string; section?: string; href?: string } & AssistantLocaleProps) {
  const content = (
    <>
      <BookOpen className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">{labels(locale).source}: </span>
      <span className="truncate">
        {lessonTitle}
        {section ? ` · ${section}` : ""}
      </span>
    </>
  );
  const className =
    "inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs text-muted-foreground";

  return href ? (
    <Link href={href} className={cn(className, "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
      {content}
    </Link>
  ) : (
    <span className={className}>{content}</span>
  );
}

export function TimestampLink({
  seconds,
  label,
  onSeek,
  locale
}: { seconds: number; label?: string; onSeek?: (seconds: number) => void } & AssistantLocaleProps) {
  const time = formatTimestamp(seconds);
  const text = label ? `${time} · ${label}` : time;

  if (!onSeek) {
    return <span className="font-medium tabular-nums text-foreground">{text}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onSeek(seconds)}
      aria-label={labels(locale).jumpTo(time)}
      className="inline-flex min-h-6 items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium tabular-nums text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <PlayCircle className="size-3.5" aria-hidden="true" />
      {text}
    </button>
  );
}

/** Feedback on the student's own attempt: never a replacement answer. */
export function AttemptFeedback({
  strengths,
  revisit,
  nextStep,
  locale
}: { strengths: string[]; revisit: string[]; nextStep: string } & AssistantLocaleProps) {
  const t = labels(locale);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <BlockLabel>{t.feedbackTitle}</BlockLabel>
      {strengths.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-success">{t.strengths}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm marker:text-success">
            {strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {revisit.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-warning-foreground">{t.revisit}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm marker:text-warning">
            {revisit.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-col gap-1 rounded-md bg-muted/60 p-2.5">
        <p className="text-xs font-medium text-muted-foreground">{t.next}</p>
        <p className="text-sm">{nextStep}</p>
      </div>
    </section>
  );
}

/** Shown in the tutor when the student is working on homework (OD-8). */
export function LearningGuardrailNotice({ locale }: AssistantLocaleProps) {
  const t = labels(locale);
  return (
    <Alert variant="info" title={t.guardrailTitle}>
      {t.guardrailBody}
    </Alert>
  );
}

/** Renders a structured assistant answer. */
export function AssistantParts({
  parts,
  locale,
  onSeek
}: { parts: AssistantPart[]; onSeek?: (seconds: number) => void } & AssistantLocaleProps) {
  return (
    <div className="flex flex-col gap-4">
      {parts.map((part, index) => {
        const key = `${part.kind}-${index}`;

        switch (part.kind) {
          case "text":
            return (
              <p key={key} className="whitespace-pre-wrap text-sm text-foreground">
                {part.text}
              </p>
            );
          case "concept":
            return <ConceptExplanation key={key} {...part} locale={locale} />;
          case "steps":
            return <GuidedSteps key={key} {...part} locale={locale} />;
          case "hint":
            return <HintCard key={key} hints={part.hints} locale={locale} />;
          case "example":
            return <ExampleBlock key={key} {...part} locale={locale} />;
          case "formula":
            return <FormulaBlock key={key} {...part} locale={locale} />;
          case "code":
            return <CodeBlock key={key} {...part} locale={locale} />;
          case "citation":
            return (
              <div key={key}>
                <LessonCitation {...part} locale={locale} />
              </div>
            );
          case "timestamp":
            return (
              <div key={key}>
                <TimestampLink {...part} onSeek={onSeek} locale={locale} />
              </div>
            );
          case "feedback":
            return <AttemptFeedback key={key} {...part} locale={locale} />;
          default: {
            const unhandled: never = part;
            return unhandled;
          }
        }
      })}
    </div>
  );
}
