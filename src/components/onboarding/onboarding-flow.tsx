"use client";

import { useMemo, useState, useTransition } from "react";
import { CourseDifficulty, LearningGoal, TimeAvailability } from "@prisma/client";
import { ArrowRight, CheckCircle2, Clock3, Compass, Sparkles, Target } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  getAssessmentQuestions,
  onboardingGoalOptions,
  onboardingLevelOptions,
  onboardingTimeOptions
} from "@/lib/onboarding/content";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type OnboardingFlowProps = {
  locale: "en" | "uz";
  userName: string;
  defaults?: {
    goal?: LearningGoal | null;
    level?: CourseDifficulty | null;
    timeAvailability?: TimeAvailability | null;
  };
};

type CompletionPayload = {
  result: {
    assessmentScore: number;
    recommendedLevel: CourseDifficulty;
    recommendedCourse: {
      slug: string;
      title: string;
      firstLessonSlug: string | null;
    } | null;
    personalizedPlan: string[];
  };
  redirectPath: string;
};

export function OnboardingFlow({ locale, userName, defaults }: OnboardingFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<LearningGoal>(defaults?.goal ?? LearningGoal.AI);
  const [level, setLevel] = useState<CourseDifficulty>(defaults?.level ?? CourseDifficulty.BEGINNER);
  const [timeAvailability, setTimeAvailability] = useState<TimeAvailability>(
    defaults?.timeAvailability ?? TimeAvailability.MODERATE
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [completion, setCompletion] = useState<CompletionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const copy =
    locale === "uz"
      ? {
          badge: "Yangi talaba yo'li",
          title: `Xush kelibsiz, ${userName}!`,
          subtitle:
            "ERA sizga nima o'rganish, qayerdan boshlash va qanday davom etishni sodda qadamlar bilan ko'rsatadi.",
          stepLabel: "Qadam",
          next: "Davom etish",
          back: "Ortga",
          finish: "Mening rejamni yaratish",
          dashboard: "Dashboardga o'tish",
          welcomeTitle: "ERA bilan boshlash juda oddiy",
          welcomeSteps: [
            "Maqsadingiz va darajangizni tanlang.",
            "Qisqa boshlang'ich assessment ni bajaring.",
            "Sizga mos kurs va o'quv rejani oling."
          ],
          profileTitle: "Sizga mos yo'nalishni tanlaymiz",
          goal: "Maqsad",
          level: "Daraja",
          time: "Haftalik vaqt",
          assessmentTitle: "Qisqa boshlang'ich assessment",
          assessmentSubtitle: "Bu test sizni baholash uchun emas, to'g'ri start nuqtasini topish uchun.",
          planTitle: "Sizning ERA rejangiz tayyor",
          planSubtitle: "Dashboard ga o'tganingizdan keyin shu reja bilan boshlaysiz.",
          recommendation: "Tavsiya etilgan start kurs",
          score: "Assessment natijasi",
          levelRecommended: "Tavsiya etilgan daraja",
          support: "Checklist sizga keyingi qadamlarni eslatib turadi.",
          chooseAll: "Iltimos, barcha savollarga javob bering.",
          saveError: "Onboarding ni saqlab bo'lmadi. Qayta urinib ko'ring."
        }
      : {
          badge: "New student path",
          title: `Welcome, ${userName}!`,
          subtitle:
            "ERA helps you understand what to learn, where to start, and how to keep moving with simple guided steps.",
          stepLabel: "Step",
          next: "Continue",
          back: "Back",
          finish: "Build my plan",
          dashboard: "Go to My Dashboard",
          welcomeTitle: "Starting with ERA is simple",
          welcomeSteps: [
            "Choose your goal, level, and study time.",
            "Take a short starting assessment.",
            "Get a recommended course and learning plan."
          ],
          profileTitle: "Let’s choose the right path for you",
          goal: "Goal",
          level: "Level",
          time: "Weekly time",
          assessmentTitle: "Short starting assessment",
          assessmentSubtitle: "This test is not to judge you. It helps ERA choose a better starting point.",
          planTitle: "Your ERA plan is ready",
          planSubtitle: "You’ll land on your dashboard with this plan already prepared.",
          recommendation: "Recommended starting course",
          score: "Assessment score",
          levelRecommended: "Recommended level",
          support: "Your checklist will keep the next steps visible.",
          chooseAll: "Please answer every question before continuing.",
          saveError: "We could not save onboarding right now. Please try again."
        };

  const questions = useMemo(() => getAssessmentQuestions(goal), [goal]);
  const progressPercent = Math.round((step / 4) * 100);

  function goNext() {
    if (step === 2) {
      startTransition(async () => {
        setError(null);

        const response = await fetch("/api/onboarding/draft", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ goal, level, timeAvailability })
        });

        if (!response.ok) {
          setError(copy.saveError);
          return;
        }

        setStep(3);
      });

      return;
    }

    setStep((current) => Math.min(current + 1, 4));
  }

  function goBack() {
    setError(null);
    setStep((current) => Math.max(current - 1, 1));
  }

  function handleComplete() {
    const allAnswered = questions.every((question) => Boolean(answers[question.id]));

    if (!allAnswered) {
      setError(copy.chooseAll);
      return;
    }

    startTransition(async () => {
      setError(null);

      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          goal,
          level,
          timeAvailability,
          answers
        })
      });

      const payload = (await response.json()) as CompletionPayload & { error?: string };

      if (!response.ok) {
        setError(payload.error ?? copy.saveError);
        return;
      }

      setCompletion(payload);
      setStep(4);
    });
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-primary/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,255,0.98))] shadow-panel">
        <CardContent className="space-y-8 p-6 sm:p-8">
          <div className="space-y-4">
            <Badge variant="outline">{copy.badge}</Badge>
            <div className="space-y-3">
              <h1 className="page-title max-w-4xl">{copy.title}</h1>
              <p className="page-lead">{copy.subtitle}</p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {copy.stepLabel} {step}/4
                </span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          </div>

          {error ? <div className="status-error rounded-2xl border px-4 py-3 text-sm">{error}</div> : null}

          {step === 1 ? (
            <div className="grid gap-6 lg:grid-cols-[1fr,0.9fr]">
              <div className="space-y-5">
                <h2 className="section-title">{copy.welcomeTitle}</h2>
                <div className="space-y-3">
                  {copy.welcomeSteps.map((item, index) => (
                    <div key={item} className="flex gap-3 rounded-[1.2rem] border border-border/70 bg-white/92 p-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                        {index + 1}
                      </div>
                      <p className="text-sm leading-7 text-muted-foreground">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-4">
                <div className="surface-subtle p-5">
                  <Compass className="h-5 w-5 text-primary" />
                  <p className="mt-3 font-medium text-foreground">Goal-based start</p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {locale === "uz"
                      ? "ERA sizni tasodifiy joyga emas, maqsadingizga mos yo'nalishga olib boradi."
                      : "ERA starts from your goal instead of dropping you into random content."}
                  </p>
                </div>
                <div className="surface-subtle p-5">
                  <Target className="h-5 w-5 text-primary" />
                  <p className="mt-3 font-medium text-foreground">Short assessment</p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {locale === "uz"
                      ? "5-10 savolli assessment bilan to'g'ri daraja tanlanadi."
                      : "A short assessment helps ERA pick a more accurate starting level."}
                  </p>
                </div>
                <div className="surface-subtle p-5">
                  <Clock3 className="h-5 w-5 text-primary" />
                  <p className="mt-3 font-medium text-foreground">Personal plan</p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {locale === "uz"
                      ? "Sizning vaqtingizga mos reja dashboard da tayyor bo'ladi."
                      : "Your dashboard will show a plan that fits your weekly time."}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-6">
              <h2 className="section-title">{copy.profileTitle}</h2>
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-4">
                  <p className="eyebrow-label text-muted-foreground">{copy.goal}</p>
                  <div className="space-y-3">
                    {onboardingGoalOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setGoal(option.value)}
                        className={cn(
                          "w-full rounded-[1.2rem] border px-4 py-4 text-left text-[15px] leading-6 transition-colors",
                          goal === option.value
                            ? "border-primary bg-primary/6 text-foreground"
                            : "border-border bg-white text-muted-foreground hover:border-primary/20 hover:bg-accent/50"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="eyebrow-label text-muted-foreground">{copy.level}</p>
                  <div className="space-y-3">
                    {onboardingLevelOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setLevel(option.value)}
                        className={cn(
                          "w-full rounded-[1.2rem] border px-4 py-4 text-left text-[15px] leading-6 transition-colors",
                          level === option.value
                            ? "border-primary bg-primary/6 text-foreground"
                            : "border-border bg-white text-muted-foreground hover:border-primary/20 hover:bg-accent/50"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="eyebrow-label text-muted-foreground">{copy.time}</p>
                  <div className="space-y-3">
                    {onboardingTimeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTimeAvailability(option.value)}
                        className={cn(
                          "w-full rounded-[1.2rem] border px-4 py-4 text-left transition-colors",
                          timeAvailability === option.value
                            ? "border-primary bg-primary/6 text-foreground"
                            : "border-border bg-white text-muted-foreground hover:border-primary/20 hover:bg-accent/50"
                        )}
                      >
                        <p className="font-medium leading-6 text-foreground">{option.label}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{option.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <h2 className="section-title">{copy.assessmentTitle}</h2>
                <p className="section-copy">{copy.assessmentSubtitle}</p>
              </div>
              <div className="space-y-4">
                {questions.map((question, index) => (
                  <div key={question.id} className="rounded-[1.25rem] border border-border/70 bg-white p-5">
                    <p className="eyebrow-label text-muted-foreground">
                      {copy.stepLabel} {index + 1}
                    </p>
                    <p className="mt-2 text-base font-medium text-foreground">{question.prompt}</p>
                    <div className="mt-4 space-y-3">
                      {question.options.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() =>
                            setAnswers((current) => ({
                              ...current,
                              [question.id]: option.id
                            }))
                          }
                          className={cn(
                            "w-full rounded-[1rem] border px-4 py-3 text-left text-sm leading-6 transition-colors",
                            answers[question.id] === option.id
                              ? "border-primary bg-primary/6 text-foreground"
                              : "border-border bg-secondary/20 text-muted-foreground hover:border-primary/20 hover:bg-accent/50"
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {step === 4 && completion ? (
            <div className="grid gap-6 lg:grid-cols-[1fr,0.9fr]">
              <div className="space-y-5">
                <div className="space-y-3">
                  <h2 className="section-title">{copy.planTitle}</h2>
                  <p className="section-copy">{copy.planSubtitle}</p>
                </div>

                <div className="surface-subtle p-5">
                  <p className="eyebrow-label text-muted-foreground">{copy.recommendation}</p>
                  <p className="mt-2 card-title text-foreground">
                    {completion.result.recommendedCourse?.title ??
                      (locale === "uz" ? "ERA tavsiya etilgan kursni tayyorlamoqda" : "ERA is preparing your recommendation")}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="surface-subtle p-5">
                    <p className="eyebrow-label text-muted-foreground">{copy.score}</p>
                    <p className="mt-2 font-display text-[2rem] font-semibold leading-none text-foreground">
                      {completion.result.assessmentScore}/6
                    </p>
                  </div>
                  <div className="surface-subtle p-5">
                    <p className="eyebrow-label text-muted-foreground">{copy.levelRecommended}</p>
                    <p className="mt-2 font-display text-[2rem] font-semibold leading-none text-foreground">
                      {completion.result.recommendedLevel.toLowerCase()}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {completion.result.personalizedPlan.map((item) => (
                    <div key={item} className="flex gap-3 rounded-[1.2rem] border border-border/70 bg-white p-4">
                      <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-primary" />
                      <p className="text-sm leading-7 text-muted-foreground">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.4rem] border border-primary/12 bg-[linear-gradient(180deg,rgba(79,70,229,0.06),rgba(255,255,255,0.96))] p-6">
                <Sparkles className="h-5 w-5 text-primary" />
                <p className="mt-4 card-title text-foreground">
                  {locale === "uz" ? "Keyingi qadamlar siz uchun tayyor" : "Your next steps are ready"}
                </p>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{copy.support}</p>
                <button
                  type="button"
                  onClick={() => router.push(completion.redirectPath)}
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "mt-6 w-full gap-2.5 rounded-[1rem] px-5 py-3.5 text-center leading-6"
                  )}
                >
                  {copy.dashboard}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={goBack}
              disabled={step === 1 || isPending}
              className="w-full sm:w-auto"
            >
              {copy.back}
            </Button>

            {step < 3 ? (
              <Button type="button" onClick={goNext} disabled={isPending} className="w-full sm:w-auto">
                {copy.next}
              </Button>
            ) : null}

            {step === 3 ? (
              <Button type="button" onClick={handleComplete} disabled={isPending} className="w-full sm:w-auto">
                {copy.finish}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
