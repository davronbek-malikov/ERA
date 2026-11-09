"use client";

import * as React from "react";
import { MessageSquare, Paperclip, Plus, Sparkles } from "lucide-react";

import { ActionCard, type ActionCardView } from "@/components/assistant/action-card";
import { AssistantComposer } from "@/components/assistant/assistant-composer";
import { AssistantMessage } from "@/components/assistant/assistant-message";
import { privacyNote } from "@/components/assistant/assistant-panel";
import { SourceList } from "@/components/assistant/source-list";
import { AssistantStatus, type AssistantState } from "@/components/assistant/assistant-status";
import type { AssistantKind } from "@/components/assistant/types";
import { TutorMarkdown } from "@/components/classroom/tutor-markdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/feedback";
import { Spinner } from "@/components/ui/spinner";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { AgentStreamFailure, streamAgent, type AgentStreamMessage } from "@/lib/ai/agent-stream";
import { cn } from "@/lib/utils";

/*
 * Teacher and Admin assistant screens, connected to the shared ERA AI Agent Engine (Prompt 08).
 * Conversations are saved on the server and belong to the signed-in user only. Answers stream in; a stopped or
 * failed answer is never saved. Teacher answers are drafts: nothing is published or changed automatically.
 */

type ConversationSummary = { id: string; title: string; courseId: string | null };
type Message = AgentStreamMessage;

type WorkspaceAssistantProps = {
  kind: Extract<AssistantKind, "teacher-assistant" | "admin-assistant">;
  name: string;
  intro: string;
  suggestions: string[];
  /** Teacher only: the teacher's own courses, offered as optional context. */
  courses?: Array<{ id: string; title: string }>;
  /** Opens this conversation on load (e.g. "Continue in the assistant" from Ask ERA AI). */
  initialConversationId?: string;
};

const NEW = "new";

export function WorkspaceAssistant({ kind, name, intro, suggestions, courses = [], initialConversationId }: WorkspaceAssistantProps) {
  const agent = kind === "teacher-assistant" ? "teacher" : "admin";
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [listState, setListState] = React.useState<"loading" | "ready" | "error">("loading");
  const [activeId, setActiveId] = React.useState<string>(NEW);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [courseId, setCourseId] = React.useState<string>("");
  const [streaming, setStreaming] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<AssistantState | null>(null);
  const [draft, setDraft] = React.useState<string | null>(null);
  // Student Management: the tool the assistant is using right now, and proposals of the answer being written.
  const [activity, setActivity] = React.useState<string | null>(null);
  const [liveActions, setLiveActions] = React.useState<ActionCardView[]>([]);
  const composerRef = React.useRef<HTMLTextAreaElement>(null);
  const abort = React.useRef<AbortController | null>(null);
  const listEnd = React.useRef<HTMLDivElement>(null);

  const loadConversations = React.useCallback(async () => {
    try {
      const response = await fetch(`/api/ai/conversations?agent=${agent}`, { cache: "no-store" });
      const payload = (await response.json()) as { ok?: boolean; conversations?: ConversationSummary[] };
      if (!response.ok || !payload.ok) throw new Error("load failed");
      setConversations(payload.conversations ?? []);
      setListState("ready");
    } catch {
      setListState("error");
    }
  }, [agent]);

  React.useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Open the requested conversation once (the API returns 404 unless it belongs to this user).
  const openedInitial = React.useRef(false);
  React.useEffect(() => {
    if (openedInitial.current || !initialConversationId || !/^[A-Za-z0-9_-]{1,64}$/.test(initialConversationId)) return;
    openedInitial.current = true;
    void openConversation({ id: initialConversationId, title: "", courseId: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversationId]);

  React.useEffect(() => {
    listEnd.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, streaming, status]);

  async function openConversation(conversation: ConversationSummary) {
    abort.current?.abort();
    setActiveId(conversation.id);
    setCourseId(conversation.courseId ?? "");
    setStatus(null);
    setStreaming(null);
    setLoadingMessages(true);
    try {
      const response = await fetch(`/api/ai/conversations/${conversation.id}?agent=${agent}`, { cache: "no-store" });
      const payload = (await response.json()) as { ok?: boolean; messages?: Message[] };
      if (!response.ok || !payload.ok) throw new Error("load failed");
      setMessages(payload.messages ?? []);
    } catch {
      setMessages([]);
      toast({ title: "This conversation couldn't load.", variant: "error" });
    } finally {
      setLoadingMessages(false);
    }
  }

  function newConversation() {
    abort.current?.abort();
    setActiveId(NEW);
    setMessages([]);
    setStatus(null);
    setStreaming(null);
    composerRef.current?.focus();
  }

  async function send(text: string) {
    const controller = new AbortController();
    abort.current = controller;
    const optimistic: Message = { id: `local-${Date.now()}`, role: "USER", content: text, createdAt: new Date().toISOString() };
    setMessages((current) => [...current, optimistic]);
    setStatus({ state: "thinking" });
    setStreaming(null);
    setActivity(null);
    setLiveActions([]);

    try {
      const result = await streamAgent(
        "/api/ai/chat",
        {
          agent,
          message: text,
          ...(activeId !== NEW ? { conversationId: activeId } : {}),
          ...(agent === "teacher" && courseId ? { courseId } : {})
        },
        controller.signal,
        {
          onDelta: (delta) => {
            setStatus(null);
            setStreaming((current) => (current ?? "") + delta);
          },
          onReset: () => setStreaming(""),
          onTool: (label) => setActivity(label),
          onAction: (action) => setLiveActions((current) => [...current, action])
        }
      );
      setMessages((current) => [...current.filter((message) => message.id !== optimistic.id), ...result.messages]);
      setStreaming(null);
      setStatus(null);
      setActivity(null);
      setLiveActions([]);
      if (result.conversationId && result.conversationId !== activeId) {
        setActiveId(result.conversationId);
      }
      void loadConversations();
    } catch (error) {
      setStreaming(null);
      setActivity(null);
      setLiveActions([]);
      // Nothing was saved for a failed or stopped answer, so the request leaves the thread too.
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      const detail = error instanceof AgentStreamFailure ? error.detail : { kind: "error" as const, message: "" };
      if (detail.kind === "cancelled") {
        setStatus(null);
        toast({ title: "Stopped. This answer wasn't saved." });
      } else if (detail.kind === "rate-limited") setStatus({ state: "rate-limited", retryAfterSeconds: detail.retryAfterSeconds });
      else if (detail.kind === "limit-reached") {
        const midnightUtc = new Date();
        midnightUtc.setUTCHours(24, 0, 0, 0);
        setStatus({ state: "quota-reached", resetsAt: midnightUtc.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
      } else if (detail.kind === "unavailable") setStatus({ state: "unavailable" });
      else if (detail.kind === "offline") setStatus({ state: "offline" });
      else if (detail.kind === "auth" || detail.kind === "forbidden") setStatus({ state: "not-permitted" });
      else setStatus({ state: "error", onRetry: () => void send(text) });
    } finally {
      if (abort.current === controller) abort.current = null;
    }
  }

  function updateAction(messageId: string, next: ActionCardView) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, actions: message.actions?.map((action) => (action.id === next.id ? next : action)) } : message
      )
    );
    // The server adds a short "done / not done" message to the conversation; reload it after a decision.
    if (next.status === "EXECUTED" || next.status === "FAILED") {
      if (activeId !== NEW) void openConversation({ id: activeId, title: "", courseId: courseId || null });
    }
  }

  function stop() {
    abort.current?.abort();
  }

  function applySuggestion(text: string) {
    // Puts the suggestion in the input so the user can edit it before sending.
    setDraft(text);
    composerRef.current?.focus();
  }

  React.useEffect(() => {
    if (draft !== null && composerRef.current) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(composerRef.current, draft);
      composerRef.current.dispatchEvent(new Event("input", { bubbles: true }));
      setDraft(null);
    }
  }, [draft]);

  const generating = status?.state === "thinking" || streaming !== null;
  const answerNote =
    agent === "teacher"
      ? "Draft — not published. Review it, then add it to your course in the course editor."
      : "Answers use platform data you're allowed to see. Changes happen only when you confirm them.";
  const empty = messages.length === 0 && !loadingMessages && streaming === null && !status;

  return (
    <div className="grid min-h-[32rem] gap-6 lg:grid-cols-[15rem,1fr]">
      <aside aria-label="Conversation history" className="flex flex-col gap-3">
        <Button variant="outline" onClick={newConversation} className="justify-start">
          <Plus />
          New conversation
        </Button>
        <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {activeId === NEW ? (
            <li className="shrink-0">
              <span className="flex w-full max-w-[16rem] items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
                <MessageSquare className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">New conversation</span>
              </span>
            </li>
          ) : null}
          {conversations.map((conversation) => (
            <li key={conversation.id} className="shrink-0">
              <button
                type="button"
                onClick={() => void openConversation(conversation)}
                aria-current={conversation.id === activeId ? "true" : undefined}
                className={cn(
                  "flex w-full max-w-[16rem] items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  conversation.id === activeId ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <MessageSquare className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{conversation.title}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          {listState === "error" ? "Saved conversations couldn't load." : "Conversations are saved to your account and visible only to you."}
        </p>
      </aside>

      <section aria-label={name} className="flex min-w-0 flex-col rounded-xl border border-border bg-card">
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
          {empty ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground" aria-hidden="true">
                  <Sparkles className="size-4" />
                </span>
                <div className="flex flex-col gap-1">
                  <h2 className="card-title">{name}</h2>
                  <p className="text-sm text-muted-foreground">{intro}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">Suggested requests</p>
                <ul className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion}>
                      <button
                        type="button"
                        onClick={() => applySuggestion(suggestion)}
                        className="rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {suggestion}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {loadingMessages ? (
            <div className="flex flex-col gap-2" role="status" aria-label="Loading conversation">
              <Skeleton className="ml-auto h-8 w-2/3 rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : null}

          {messages.map((message) =>
            message.role === "USER" ? (
              <AssistantMessage key={message.id} role="user">
                {message.content}
              </AssistantMessage>
            ) : (
              <AssistantMessage key={message.id} role="assistant" assistantName={name}>
                <div className="flex flex-col gap-3">
                  <TutorMarkdown text={message.content} locale="en" />
                  <SourceList sources={message.sources} />
                  {message.actions?.map((action) => (
                    <ActionCard key={action.id} action={action} onChange={(next) => updateAction(message.id, next)} />
                  ))}
                  <p className="text-xs text-muted-foreground">{answerNote}</p>
                </div>
              </AssistantMessage>
            )
          )}

          {streaming !== null || activity || liveActions.length ? (
            <AssistantMessage role="assistant" assistantName={name}>
              <div aria-busy="true" className="flex flex-col gap-3">
                {streaming ? <TutorMarkdown text={streaming} locale="en" /> : null}
                {activity ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                    <Spinner className="size-3.5" />
                    {activity}…
                  </p>
                ) : null}
                {liveActions.length ? (
                  <p className="text-xs text-muted-foreground">
                    {liveActions.length === 1 ? "A change is ready for your review" : `${liveActions.length} changes are ready for your review`} — the
                    confirmation card appears when the answer finishes.
                  </p>
                ) : null}
              </div>
            </AssistantMessage>
          ) : null}

          {status ? <AssistantStatus status={status} /> : null}
          <div ref={listEnd} />
        </div>

        <div className="flex flex-col gap-2 border-t border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            {agent === "teacher" ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Course context
                <Select
                  value={courseId}
                  onChange={(event) => setCourseId(event.target.value)}
                  disabled={generating}
                  className="h-8 w-auto max-w-[16rem] text-xs"
                  aria-label="Course the assistant may use"
                >
                  <option value="">No course</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => toast({ title: "File upload isn't available yet", description: "Attaching PDFs and slides will come later. You can paste text into the message." })}
            >
              <Paperclip />
              Attach file
            </Button>
            <span className="text-xs text-muted-foreground">PDF, slides and documents (coming soon)</span>
          </div>
          <AssistantComposer
            ref={composerRef}
            onSubmit={(text) => void send(text)}
            generating={generating}
            onStop={stop}
            placeholder={`Ask ${name}`}
            footnote={privacyNote(kind)}
          />
        </div>
      </section>
    </div>
  );
}
