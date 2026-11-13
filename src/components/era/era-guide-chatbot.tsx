"use client";

import { type FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { Bot, Compass, Loader2, MessageCircle, Send, Sparkles, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getEraGuideQuickActions, findEraGuideAnswer } from "@/lib/era-guide/matcher";
import type { EraGuideAnswer } from "@/lib/era-guide/types";
import { cn } from "@/lib/utils";

type EraGuideChatbotProps = {
  locale?: "en" | "uz";
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  answer?: EraGuideAnswer;
};

function getCopy(locale: "en" | "uz") {
  if (locale === "uz") {
    return {
      title: "ERA Guide",
      subtitle: "Platformadan qanday foydalanishni tez tushuntiradi.",
      welcome: "Salom, men ERA Guide. Ro'yxatdan o'tish, kirish, kurs topish va o'qishni davom ettirish bo'yicha yordam bera olaman.",
      placeholder: "Savol yozing...",
      send: "Yuborish",
      ask: "Mendan so'rang",
      typing: "ERA Guide javob tayyorlayapti...",
      unknown: "Men bu haqida aniq ma'lumot topmadim, lekin asosiy bo'limlar bo'yicha yordam bera olaman."
    };
  }

  return {
    title: "ERA Guide",
    subtitle: "Quick help for using the platform.",
    welcome: "Hi, I’m ERA Guide. I can help with registration, login, courses, dashboard, support, and how ERA works.",
    placeholder: "Ask a question...",
    send: "Send",
    ask: "Ask ERA Guide",
    typing: "ERA Guide is preparing an answer...",
    unknown: "I do not have a confident answer for that yet, but I can still help with the main platform steps."
  };
}

function AnswerCard({ answer }: { answer: EraGuideAnswer }) {
  return (
    <div className="space-y-3">
      <p className="font-semibold text-foreground">{answer.title}</p>
      <p className="text-sm leading-7 text-muted-foreground">{answer.body}</p>
      {answer.steps && answer.steps.length > 0 ? (
        <ol className="space-y-2 text-sm text-muted-foreground">
          {answer.steps.map((step, index) => (
            <li key={`${step}-${index}`} className="flex gap-3 leading-7">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {answer.links && answer.links.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {answer.links.map((link) => (
            <Link
              key={`${link.href}-${link.label}`}
              href={link.href}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 px-3")}
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function EraGuideChatbot({ locale = "en" }: EraGuideChatbotProps) {
  const copy = getCopy(locale);
  const quickActions = useMemo(() => getEraGuideQuickActions(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: copy.welcome
    }
  ]);

  async function askQuestion(rawQuestion: string) {
    const trimmedQuestion = rawQuestion.trim();

    if (!trimmedQuestion || isTyping) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: "user",
        text: trimmedQuestion
      }
    ]);
    setQuestion("");
    setIsTyping(true);

    const result = findEraGuideAnswer(trimmedQuestion);

    await new Promise((resolve) => setTimeout(resolve, 450));

    setMessages((current) => [
      ...current,
      {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: result.matchedEntry ? result.answer.body : copy.unknown,
        answer: result.answer
      }
    ]);
    setIsTyping(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await askQuestion(question);
  }

  return (
    // Only the open panel and the round button accept taps. The wrapper never does, and the closed panel is
    // removed from the layout entirely — an invisible panel used to cover the page and block form fields on phones.
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-end sm:inset-x-6 sm:bottom-6">
      <div className="pointer-events-none flex w-full max-w-[24rem] flex-col items-end gap-3 sm:w-auto">
        <div
          className={cn(
            "w-full overflow-hidden rounded-xl border border-primary/15 bg-card/95 shadow-[0_20px_60px_rgba(76,99,210,0.18)] backdrop-blur-xl sm:w-[24rem]",
            isOpen ? "pointer-events-auto max-h-[calc(100dvh-6rem)] overflow-y-auto" : "hidden"
          )}
        >
          <div className="border-b border-border/70 bg-muted px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-card/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary shadow-sm">
                  <Sparkles className="h-3.5 w-3.5" />
                  ERA Guide
                </p>
                <h2 className="mt-3 font-display text-2xl font-semibold text-foreground">{copy.title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-card/80 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Close ERA Guide"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-4 px-4 py-4">
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => void askQuestion(action.prompt)}
                  className="rounded-full border border-border/70 bg-secondary/55 px-3 py-2 text-xs font-medium text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-card hover:text-foreground"
                >
                  {action.label}
                </button>
              ))}
            </div>

            <div className="max-h-[24rem] space-y-3 overflow-y-auto rounded-xl bg-card p-3">
              {messages.map((message) => {
                const isAssistant = message.role === "assistant";

                return (
                  <div
                    key={message.id}
                    className={cn("flex gap-3", isAssistant ? "justify-start" : "justify-end")}
                  >
                    {isAssistant ? (
                      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Bot className="h-4 w-4" />
                      </div>
                    ) : null}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-xl px-4 py-3 shadow-sm",
                        isAssistant
                          ? "border border-border/70 bg-card"
                          : "bg-primary text-primary-foreground"
                      )}
                    >
                      {message.answer ? (
                        <AnswerCard answer={message.answer} />
                      ) : (
                        <p
                          className={cn(
                            "text-sm leading-7",
                            isAssistant ? "text-muted-foreground" : "text-primary-foreground"
                          )}
                        >
                          {message.text}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

              {isTyping ? (
                <div className="flex gap-3">
                  <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-xl border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {copy.typing}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <Input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={copy.placeholder}
                className="h-12 rounded-lg bg-card"
              />
              <Button type="submit" size="icon" disabled={!question.trim() || isTyping}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="group pointer-events-auto flex items-center gap-3 rounded-full border border-primary/20 bg-card px-4 py-3 text-left shadow-[0_18px_45px_rgba(59,130,246,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(79,70,229,0.24)]"
          aria-expanded={isOpen}
          aria-label={copy.ask}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white">
            {isOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
          </div>
          <div className="hidden pr-1 sm:block">
            <p className="text-sm font-semibold text-foreground">{copy.ask}</p>
            <p className="text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Compass className="h-3.5 w-3.5" />
                Register, login, courses, dashboard
              </span>
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
