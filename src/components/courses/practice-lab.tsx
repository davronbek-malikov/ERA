"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Code2, Lightbulb, Loader2, Rocket, TerminalSquare } from "lucide-react";

import {
  getPracticeLanguageLabel,
  getPracticeLanguageVariant,
  PRACTICE_LANGUAGES,
  type PracticeLanguage
} from "@/lib/practice-languages";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type PracticeLabProps = {
  exercises: Array<{
    id: string;
    type: "CODING" | "MINI_PROJECT";
    title: string;
    slug: string;
    instructions: string;
    language: string;
    starterCode: string;
    solutionCode: string;
    hints: string[];
    solutionNotes: string | null;
    submissions: Array<{
      id: string;
      language: string;
      code: string;
      status: "PASSED" | "FAILED";
      passedCount: number;
      totalTests: number;
      feedback: unknown;
    }>;
  }>;
  locale: "en" | "uz";
  lessonPath: string;
  isAuthenticated: boolean;
};

type PracticeResult = {
  status: "PASSED" | "FAILED";
  passedCount: number;
  totalTests: number;
  feedback: Array<{
    description: string;
    passed: boolean;
    expected: unknown;
    actual: unknown;
  }>;
  solutionCode: string;
  solutionNotes: string | null;
};

function createPracticeCodeState(exercises: PracticeLabProps["exercises"]) {
  const entries = exercises.flatMap((exercise) =>
    PRACTICE_LANGUAGES.map((language) => {
      const key = `${exercise.id}:${language.value}`;
      const submission = exercise.submissions.find((item) => item.language === language.value);
      const variant = getPracticeLanguageVariant(exercise, language.value);
      return [key, submission?.code ?? variant.starterCode] as const;
    })
  );

  return Object.fromEntries(entries);
}

function getLanguageKey(exerciseId: string, language: PracticeLanguage) {
  return `${exerciseId}:${language}`;
}

export function PracticeLab({
  exercises,
  locale,
  lessonPath,
  isAuthenticated
}: PracticeLabProps) {
  const [selectedExerciseId, setSelectedExerciseId] = useState(exercises[0]?.id ?? null);
  const [languageByExerciseId, setLanguageByExerciseId] = useState<Record<string, PracticeLanguage>>(
    Object.fromEntries(exercises.map((exercise) => [exercise.id, "python" as const]))
  );
  const [codeByExerciseLanguage, setCodeByExerciseLanguage] = useState<Record<string, string>>(
    createPracticeCodeState(exercises)
  );
  const [resultByExerciseLanguage, setResultByExerciseLanguage] = useState<Record<string, PracticeResult>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [showHints, setShowHints] = useState<Record<string, boolean>>({});
  const [showSolution, setShowSolution] = useState<Record<string, boolean>>({});
  const [errorByExerciseLanguage, setErrorByExerciseLanguage] = useState<Record<string, string>>({});

  const exercise = useMemo(
    () => exercises.find((item) => item.id === selectedExerciseId) ?? exercises[0] ?? null,
    [exercises, selectedExerciseId]
  );

  const selectedLanguage = exercise ? languageByExerciseId[exercise.id] ?? "python" : "python";
  const selectedKey = exercise ? getLanguageKey(exercise.id, selectedLanguage) : null;
  const variant = exercise ? getPracticeLanguageVariant(exercise, selectedLanguage) : null;
  const matchingSubmission =
    exercise?.submissions.find((submission) => submission.language === selectedLanguage) ?? null;
  const result = selectedKey ? resultByExerciseLanguage[selectedKey] : null;

  const copy =
    locale === "uz"
      ? {
          title: "Interactive practice",
          subtitle: "Python, JavaScript yoki TypeScript da kod yozing va natijani darhol tekshiring.",
          runChecks: "Tekshirish",
          hints: "Hintlar",
          solution: "Yechim",
          signIn: "Practice ni saqlash uchun kiring",
          noExercises: "Bu dars uchun practice mashqlari tez orada qo'shiladi.",
          latest: "Oxirgi natija",
          miniProject: "Mini project",
          coding: "Coding exercise",
          language: "Til",
          failed: "Qayta urinib ko'ring",
          passed: "O'tdi",
          unsupported: "Bu til hali qo'llab-quvvatlanmaydi.",
          saveError: "Tekshiruvni yakunlab bo'lmadi. Yana urinib ko'ring."
        }
      : {
          title: "Interactive practice",
          subtitle: "Write in Python, JavaScript, or TypeScript and check your answer instantly.",
          runChecks: "Run checks",
          hints: "Hints",
          solution: "Solution",
          signIn: "Sign in to save practice",
          noExercises: "Practice exercises for this lesson are coming soon.",
          latest: "Latest result",
          miniProject: "Mini project",
          coding: "Coding exercise",
          language: "Language",
          failed: "Try again",
          passed: "Passed",
          unsupported: "This language is not supported yet.",
          saveError: "The checker could not finish this run. Please try again."
        };

  async function runChecks() {
    if (!exercise || !variant || !selectedKey || !isAuthenticated) {
      return;
    }

    setLoadingKey(selectedKey);
    setErrorByExerciseLanguage((current) => ({
      ...current,
      [selectedKey]: ""
    }));

    try {
      const response = await fetch(`/api/practice/${exercise.id}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          code: codeByExerciseLanguage[selectedKey] ?? variant.starterCode,
          language: selectedLanguage
        })
      });
      const payload = (await response.json()) as {
        error?: {
          message?: string;
        };
        data?: PracticeResult;
      };

      if (!response.ok || !payload.data) {
        setErrorByExerciseLanguage((current) => ({
          ...current,
          [selectedKey]: payload.error?.message ?? copy.saveError
        }));
        return;
      }

      const practiceResult = payload.data;

      setResultByExerciseLanguage((current) => ({
        ...current,
        [selectedKey]: practiceResult
      }));
    } finally {
      setLoadingKey(null);
    }
  }

  if (!exercise || !variant || !selectedKey) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">{copy.noExercises}</CardContent>
      </Card>
    );
  }

  const currentCode = codeByExerciseLanguage[selectedKey] ?? variant.starterCode;
  const currentError = errorByExerciseLanguage[selectedKey];

  return (
    <Card className="border-primary/10 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(246,248,255,0.98))]">
      <CardContent className="space-y-6 p-5">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{copy.title}</p>
          <h2 className="card-title">{exercise.title}</h2>
          <p className="text-sm leading-7 text-muted-foreground">{copy.subtitle}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {exercises.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedExerciseId(item.id)}
              className={cn(
                "rounded-full border px-3 py-2 text-sm transition-colors",
                item.id === exercise.id
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border/70 bg-white text-muted-foreground hover:border-primary/20 hover:text-foreground"
              )}
            >
              {item.type === "MINI_PROJECT" ? copy.miniProject : copy.coding}
            </button>
          ))}
        </div>

        <div className="rounded-[1.3rem] border border-border/70 bg-white px-4 py-4 text-sm leading-7 text-muted-foreground">
          {exercise.instructions}
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-2">
                <Code2 className="h-3.5 w-3.5" />
                {getPracticeLanguageLabel(selectedLanguage)}
              </Badge>
              {matchingSubmission ? (
                <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {copy.latest}: {matchingSubmission.status.toLowerCase()}
                </span>
              ) : null}
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{copy.language}</span>
              <select
                value={selectedLanguage}
                onChange={(event) =>
                  setLanguageByExerciseId((current) => ({
                    ...current,
                    [exercise.id]: event.target.value as PracticeLanguage
                  }))
                }
                className="rounded-full border border-border/70 bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/40"
              >
                {PRACTICE_LANGUAGES.map((language) => (
                  <option key={language.value} value={language.value}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Textarea
            value={currentCode}
            onChange={(event) =>
              setCodeByExerciseLanguage((current) => ({
                ...current,
                [selectedKey]: event.target.value
              }))
            }
            className="min-h-[280px] font-mono text-sm"
            spellCheck={false}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          {isAuthenticated ? (
            <Button type="button" onClick={runChecks} disabled={loadingKey === selectedKey}>
              {loadingKey === selectedKey ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TerminalSquare className="h-4 w-4" />
              )}
              {copy.runChecks}
            </Button>
          ) : (
            <Link
              href={`/sign-in?next=${encodeURIComponent(lessonPath)}`}
              className={cn(buttonVariants(), "w-full sm:w-auto")}
            >
              <Rocket className="h-4 w-4" />
              {copy.signIn}
            </Link>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setShowHints((current) => ({
                ...current,
                [selectedKey]: !current[selectedKey]
              }))
            }
          >
            <Lightbulb className="h-4 w-4" />
            {copy.hints}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setShowSolution((current) => ({
                ...current,
                [selectedKey]: !current[selectedKey]
              }))
            }
          >
            <CheckCircle2 className="h-4 w-4" />
            {copy.solution}
          </Button>
        </div>

        {currentError ? (
          <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {currentError}
          </div>
        ) : null}

        {showHints[selectedKey] ? (
          <div className="space-y-2">
            {exercise.hints.map((hint) => (
              <div
                key={`${selectedKey}-${hint}`}
                className="rounded-[1rem] border border-border/70 bg-secondary/30 px-4 py-3 text-sm text-muted-foreground"
              >
                {hint}
              </div>
            ))}
          </div>
        ) : null}

        {showSolution[selectedKey] ? (
          <div className="space-y-3 rounded-[1.2rem] border border-border/70 bg-white px-4 py-4">
            <pre className="overflow-x-auto whitespace-pre-wrap text-sm text-foreground">
              <code>{result?.solutionCode ?? variant.solutionCode}</code>
            </pre>
            <p className="text-sm leading-7 text-muted-foreground">
              {result?.solutionNotes ?? exercise.solutionNotes}
            </p>
          </div>
        ) : null}

        {result ? (
          <div className="space-y-3 rounded-[1.2rem] border border-border/70 bg-white px-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {result.status === "PASSED" ? copy.passed : copy.failed}
              </p>
              <p className="text-sm text-muted-foreground">
                {result.passedCount}/{result.totalTests}
              </p>
            </div>
            <div className="space-y-2">
              {result.feedback.map((item) => (
                <div
                  key={`${selectedKey}-${item.description}`}
                  className="rounded-[1rem] bg-secondary/30 px-4 py-3 text-sm text-muted-foreground"
                >
                  <p className="font-medium text-foreground">{item.description}</p>
                  <p className={cn("mt-1", item.passed ? "text-emerald-700" : "text-rose-700")}>
                    {item.passed
                      ? copy.passed
                      : `Expected ${JSON.stringify(item.expected)}, got ${JSON.stringify(item.actual)}`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
