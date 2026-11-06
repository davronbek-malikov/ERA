"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Loader2, Sparkles, User } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type LessonChatProps = {
  id?: string;
  lessonId: string;
  lessonPath: string;
  locale: "en" | "uz";
  isAuthenticated: boolean;
};

type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
};

function getCopy(locale: "en" | "uz") {
  if (locale === "uz") {
    return {
      title: "ERA yordamchisi",
      subtitle: "Joriy dars haqida savol bering va sodda bosqichma-bosqich javob oling.",
      empty: "ERA dan shu dars haqida so'rang",
      placeholder: "Masalan: Bu tushunchani oddiyroq qilib tushuntirib bera olasizmi?",
      send: "ERA dan so'rash",
      thinking: "ERA o'ylayapti...",
      signIn: "Chat tarixini saqlash uchun tizimga kiring.",
      historyError: "ERA chat tarixini yuklab bo'lmadi.",
      chatError: "ERA hozir javob bera olmayapti. Iltimos, yana urinib ko'ring."
    };
  }

  return {
    title: "ERA Assistant",
    subtitle: "Ask about the current lesson and get a simple step-by-step explanation.",
    empty: "Ask ERA about this lesson",
    placeholder: "For example: Can you explain this idea in a simpler way?",
    send: "Ask ERA",
    thinking: "ERA is thinking...",
    signIn: "Sign in to save your ERA chat history.",
    historyError: "Could not load ERA chat history.",
    chatError: "ERA could not answer right now. Please try again."
  };
}

function renderTextBlock(content: string) {
  return content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph, index) => (
      <p key={`${paragraph.slice(0, 20)}-${index}`} className="whitespace-pre-wrap leading-7">
        {paragraph}
      </p>
    ));
}

function MessageBody({ content }: { content: string }) {
  const parts = useMemo(() => {
    const pattern = /```(\w+)?\n([\s\S]*?)```/g;
    const items: Array<
      | { type: "text"; value: string }
      | { type: "code"; language: string; value: string }
    > = [];
    let lastIndex = 0;
    let match = pattern.exec(content);

    while (match) {
      if (match.index > lastIndex) {
        items.push({
          type: "text",
          value: content.slice(lastIndex, match.index)
        });
      }

      items.push({
        type: "code",
        language: match[1] || "text",
        value: match[2].trimEnd()
      });

      lastIndex = pattern.lastIndex;
      match = pattern.exec(content);
    }

    if (lastIndex < content.length) {
      items.push({
        type: "text",
        value: content.slice(lastIndex)
      });
    }

    return items;
  }, [content]);

  return (
    <div className="space-y-4 text-sm text-foreground">
      {parts.map((part, index) =>
        part.type === "code" ? (
          <div key={`${part.language}-${index}`} className="overflow-hidden rounded-lg border border-slate-200">
            <div className="eyebrow-label border-b border-slate-200 bg-slate-100 px-4 py-2 text-slate-500">
              {part.language}
            </div>
            <pre className="overflow-x-auto bg-slate-950 px-4 py-4 text-xs text-slate-100">
              <code>{part.value}</code>
            </pre>
          </div>
        ) : (
          <div key={`text-${index}`} className="space-y-3">
            {renderTextBlock(part.value)}
          </div>
        )
      )}
    </div>
  );
}

export function LessonChat({ id, lessonId, lessonPath, locale, isAuthenticated }: LessonChatProps) {
  const copy = getCopy(locale);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(isAuthenticated);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSubmitting]);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoadingHistory(false);
      return;
    }

    let cancelled = false;

    async function loadHistory() {
      try {
        const response = await fetch(`/api/era/history?lesson_id=${encodeURIComponent(lessonId)}`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as {
          messages?: ChatMessage[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || copy.historyError);
        }

        if (!cancelled) {
          setMessages(payload.messages ?? []);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : copy.historyError);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false);
        }
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [copy.historyError, isAuthenticated, lessonId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedQuestion = question.trim();

    if (!normalizedQuestion || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const optimisticUserMessage: ChatMessage = {
      id: `temp-user-${Date.now()}`,
      role: "USER",
      content: normalizedQuestion,
      createdAt: new Date().toISOString()
    };

    setMessages((current) => [...current, optimisticUserMessage]);
    setQuestion("");

    try {
      const response = await fetch("/api/era/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          lessonId,
          question: normalizedQuestion
        })
      });

      const payload = (await response.json()) as {
        messages?: ChatMessage[];
        error?: string;
      };

      if (!response.ok || !payload.messages) {
        throw new Error(payload.error || copy.chatError);
      }

      const persistedMessages = payload.messages;

      setMessages((current) => [
        ...current.filter((message) => message.id !== optimisticUserMessage.id),
        ...persistedMessages
      ]);
    } catch (submitError) {
      setMessages((current) => current.filter((message) => message.id !== optimisticUserMessage.id));
      setQuestion(normalizedQuestion);
      setError(submitError instanceof Error ? submitError.message : copy.chatError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card id={id} className="border-primary/10 bg-card">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              ERA
            </p>
            <CardTitle className="mt-3">{copy.title}</CardTitle>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">{copy.subtitle}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!isAuthenticated ? (
          <div className="surface-subtle border border-border/70 px-4 py-4 text-sm leading-7 text-muted-foreground">
            {copy.signIn}
            <Link
              href={`/sign-in?next=${encodeURIComponent(lessonPath)}`}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }), "ml-3 h-9 px-3")}
            >
              {locale === "uz" ? "Kirish" : "Sign in"}
            </Link>
          </div>
        ) : null}

        {error ? (
          <div className="status-error rounded-xl border px-4 py-3 text-sm">
            {error}
          </div>
        ) : null}

        <div className="max-h-[520px] space-y-4 overflow-y-auto rounded-xl border border-border/70 bg-card/80 p-4">
          {isLoadingHistory ? (
            <div className="flex items-center gap-3 rounded-lg bg-secondary/45 px-4 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {copy.thinking}
            </div>
          ) : messages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-secondary/35 px-4 py-8 text-center text-sm text-muted-foreground">
              {copy.empty}
            </div>
          ) : (
            messages.map((message) => {
              const isUser = message.role === "USER";

              return (
                <div
                  key={message.id}
                  className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}
                >
                  {!isUser ? (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Bot className="h-4 w-4" />
                    </div>
                  ) : null}
                  <div
                    className={cn(
                      "max-w-[88%] rounded-xl px-4 py-4 shadow-sm",
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "border border-border/70 bg-card text-foreground"
                    )}
                  >
                    <div className="eyebrow-label mb-2 flex items-center gap-2 opacity-80">
                      {isUser ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {isUser ? "Student" : "ERA"}
                    </div>
                    {isUser ? (
                      <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
                    ) : (
                      <MessageBody content={message.content} />
                    )}
                  </div>
                </div>
              );
            })
          )}

          {isSubmitting ? (
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-xl border border-border/70 bg-card px-4 py-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {copy.thinking}
                </div>
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={copy.placeholder}
            disabled={!isAuthenticated || isSubmitting}
            className="min-h-28 bg-card"
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={!isAuthenticated || isSubmitting || !question.trim()}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {copy.send}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
