"use client";

import * as React from "react";
import { ArrowUp, AudioLines, Loader2, Mic, MessageSquare, PhoneOff, Plus, Square, Volume2 } from "lucide-react";

import { ActionCard, type ActionCardView } from "@/components/assistant/action-card";
import { AssistantStatus, type AssistantState } from "@/components/assistant/assistant-status";
import { SourceList } from "@/components/assistant/source-list";
import type { AssistantKind } from "@/components/assistant/types";
import { TutorMarkdown } from "@/components/classroom/tutor-markdown";
import { Skeleton } from "@/components/ui/feedback";
import { toast } from "@/components/ui/toast";
import { AgentStreamFailure, streamAgent, type AgentStreamMessage } from "@/lib/ai/agent-stream";
import { speak, speechSupported, startRecording, stopSpeaking, transcribe, voiceSupported, type Recording } from "@/lib/ai/voice";
import { cn } from "@/lib/utils";

/*
 * ERA Assistant for teachers and administrators (shared AI engine, docs/ERA_AI_ARCHITECTURE.md).
 * A minimal chat: one input bar with voice dictation and a hands-free talk mode. Conversations are saved for the
 * signed-in user only. Proposed changes appear as cards and happen only after Confirm.
 */

type ConversationSummary = { id: string; title: string; courseId: string | null };
type Message = AgentStreamMessage;
export type Suggestion = { label: string; prompt: string; icon?: React.ReactNode };

type WorkspaceAssistantProps = {
  kind: Extract<AssistantKind, "teacher-assistant" | "admin-assistant">;
  name: string;
  greeting: string;
  suggestions: Suggestion[];
  /** Opens this conversation on load (e.g. "Continue in the assistant" from Ask ERA AI). */
  initialConversationId?: string;
};

const NEW = "new";
type TalkState = "off" | "listening" | "transcribing" | "thinking" | "speaking";

export function WorkspaceAssistant({ kind, name, greeting, suggestions, initialConversationId }: WorkspaceAssistantProps) {
  const agent = kind === "teacher-assistant" ? "teacher" : "admin";
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = React.useState<string>(NEW);
  const activeIdRef = React.useRef<string>(NEW);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [streaming, setStreaming] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<AssistantState | null>(null);
  const [activity, setActivity] = React.useState<string | null>(null);
  const [input, setInput] = React.useState("");
  const [dictating, setDictating] = React.useState<"off" | "recording" | "transcribing">("off");
  const [talk, setTalk] = React.useState<TalkState>("off");
  const [level, setLevel] = React.useState(0);
  // Browser capabilities are known only after mounting (the server can't know them): avoids hydration mismatches.
  const [canVoice, setCanVoice] = React.useState(false);
  const [canSpeak, setCanSpeak] = React.useState(false);
  React.useEffect(() => {
    setCanVoice(voiceSupported());
    setCanSpeak(speechSupported());
  }, []);
  const abort = React.useRef<AbortController | null>(null);
  const recording = React.useRef<Recording | null>(null);
  const talkOn = React.useRef(false);
  const listEnd = React.useRef<HTMLDivElement>(null);
  const textarea = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const loadConversations = React.useCallback(async () => {
    try {
      const response = await fetch(`/api/ai/conversations?agent=${agent}`, { cache: "no-store" });
      const payload = (await response.json()) as { ok?: boolean; conversations?: ConversationSummary[] };
      if (response.ok && payload.ok) setConversations(payload.conversations ?? []);
    } catch {
      // History is optional; the chat still works.
    }
  }, [agent]);

  React.useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const openConversation = React.useCallback(
    async (id: string) => {
      abort.current?.abort();
      setActiveId(id);
      setStatus(null);
      setStreaming(null);
      setLoadingMessages(true);
      try {
        const response = await fetch(`/api/ai/conversations/${id}?agent=${agent}`, { cache: "no-store" });
        const payload = (await response.json()) as { ok?: boolean; messages?: Message[] };
        if (!response.ok || !payload.ok) throw new Error("load failed");
        setMessages(payload.messages ?? []);
      } catch {
        setMessages([]);
        toast({ title: "This conversation couldn't load.", variant: "error" });
      } finally {
        setLoadingMessages(false);
      }
    },
    [agent]
  );

  const openedInitial = React.useRef(false);
  React.useEffect(() => {
    if (openedInitial.current || !initialConversationId || !/^[A-Za-z0-9_-]{1,64}$/.test(initialConversationId)) return;
    openedInitial.current = true;
    void openConversation(initialConversationId);
  }, [initialConversationId, openConversation]);

  React.useEffect(() => {
    listEnd.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, streaming, status, activity]);

  // Stop the microphone and speech when leaving the page.
  React.useEffect(
    () => () => {
      talkOn.current = false;
      recording.current?.cancel();
      stopSpeaking();
    },
    []
  );

  function newConversation() {
    abort.current?.abort();
    setActiveId(NEW);
    setMessages([]);
    setStatus(null);
    setStreaming(null);
    textarea.current?.focus();
  }

  /** Sends a message; resolves with the assistant's answer text (null if it failed or was stopped). */
  async function send(text: string): Promise<string | null> {
    const message = text.trim();
    if (!message) return null;
    const controller = new AbortController();
    abort.current = controller;
    const optimistic: Message = { id: `local-${Date.now()}`, role: "USER", content: message, createdAt: new Date().toISOString() };
    setMessages((current) => [...current, optimistic]);
    setStatus({ state: "thinking" });
    setStreaming(null);
    setActivity(null);

    try {
      const current = activeIdRef.current;
      const result = await streamAgent("/api/ai/chat", { agent, message, ...(current !== NEW ? { conversationId: current } : {}) }, controller.signal, {
        onDelta: (delta) => {
          setStatus(null);
          setStreaming((value) => (value ?? "") + delta);
        },
        onReset: () => setStreaming(""),
        onTool: (label) => setActivity(label),
        onAction: () => setActivity("Preparing a change for you to confirm")
      });
      setMessages((list) => [...list.filter((item) => item.id !== optimistic.id), ...result.messages]);
      if (result.conversationId && result.conversationId !== current) setActiveId(result.conversationId);
      void loadConversations();
      const answer = result.messages.filter((item) => item.role === "ASSISTANT").at(-1);
      return answer ? answer.content + (answer.actions?.length ? " Please confirm the change on screen." : "") : null;
    } catch (error) {
      setMessages((list) => list.filter((item) => item.id !== optimistic.id));
      const detail = error instanceof AgentStreamFailure ? error.detail : { kind: "error" as const, message: "" };
      if (detail.kind === "cancelled") setStatus(null);
      else if (detail.kind === "rate-limited") setStatus({ state: "rate-limited", retryAfterSeconds: detail.retryAfterSeconds });
      else if (detail.kind === "limit-reached") setStatus({ state: "quota-reached", resetsAt: "midnight UTC" });
      else if (detail.kind === "unavailable") setStatus({ state: "unavailable" });
      else if (detail.kind === "offline") setStatus({ state: "offline" });
      else if (detail.kind === "auth" || detail.kind === "forbidden") setStatus({ state: "not-permitted" });
      else setStatus({ state: "error", onRetry: () => void send(message) });
      return null;
    } finally {
      setStreaming(null);
      setActivity(null);
      setStatus((value) => (value?.state === "thinking" ? null : value));
      if (abort.current === controller) abort.current = null;
    }
  }

  function submit() {
    if (!input.trim() || generating) return;
    const text = input;
    setInput("");
    void send(text);
  }

  // ----- Dictation: record, then put the words in the input -----------------------------------------
  async function toggleDictation() {
    if (dictating === "recording") {
      const audio = await recording.current?.stop();
      recording.current = null;
      setLevel(0);
      if (!audio) return setDictating("off");
      setDictating("transcribing");
      try {
        const text = await transcribe(audio);
        if (text) setInput((value) => (value.trim() ? `${value.trimEnd()} ${text}` : text));
        textarea.current?.focus();
      } catch (error) {
        toast({ title: error instanceof Error ? error.message : "Voice input failed.", variant: "error" });
      } finally {
        setDictating("off");
      }
      return;
    }
    if (dictating !== "off") return;
    try {
      recording.current = await startRecording({ onLevel: setLevel });
      setDictating("recording");
    } catch {
      toast({ title: "Microphone not available", description: "Allow microphone access in your browser settings.", variant: "error" });
    }
  }

  // ----- Talk mode: listen → answer → speak → listen again ------------------------------------------
  async function listenOnce() {
    if (!talkOn.current) return;
    setTalk("listening");
    let resolveStop: () => void = () => undefined;
    const stopped = new Promise<void>((resolve) => (resolveStop = resolve));
    try {
      recording.current = await startRecording({ onLevel: setLevel, autoStopSilenceMs: 1400, onAutoStop: () => resolveStop(), maxDurationMs: 90_000 });
    } catch {
      endTalk();
      toast({ title: "Microphone not available", description: "Allow microphone access in your browser settings.", variant: "error" });
      return;
    }
    await stopped;
    if (!talkOn.current) return;
    const audio = await recording.current?.stop();
    recording.current = null;
    setLevel(0);
    if (!audio) return void listenOnce();
    setTalk("transcribing");
    let text = "";
    try {
      text = await transcribe(audio);
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Voice input failed.", variant: "error" });
    }
    if (!talkOn.current) return;
    if (!text) return void listenOnce();
    setTalk("thinking");
    const answer = await send(text);
    if (!talkOn.current) return;
    if (answer && canSpeak) {
      setTalk("speaking");
      await speak(answer);
    }
    if (talkOn.current) void listenOnce();
  }

  function startTalk() {
    if (!voiceSupported()) {
      toast({ title: "Voice isn't supported in this browser.", variant: "error" });
      return;
    }
    talkOn.current = true;
    void listenOnce();
  }

  function endTalk() {
    talkOn.current = false;
    recording.current?.cancel();
    recording.current = null;
    stopSpeaking();
    setLevel(0);
    setTalk("off");
  }

  function updateAction(messageId: string, next: ActionCardView) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, actions: message.actions?.map((action) => (action.id === next.id ? next : action)) } : message
      )
    );
    if ((next.status === "EXECUTED" || next.status === "FAILED") && activeId !== NEW) void openConversation(activeId);
  }

  const generating = status?.state === "thinking" || streaming !== null;
  const empty = messages.length === 0 && !loadingMessages && streaming === null && !status;


  const composer = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex w-full items-end gap-1.5 rounded-[1.75rem] border border-border bg-card p-2 shadow-soft focus-within:border-primary/40"
    >
      <button
        type="button"
        onClick={newConversation}
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="New chat"
        title="New chat"
      >
        <Plus className="size-5" />
      </button>
      <textarea
        ref={textarea}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        rows={1}
        maxLength={6000}
        placeholder={dictating === "recording" ? "Listening… tap the mic to finish" : `Ask ${name}`}
        aria-label={`Message ${name}`}
        className="max-h-48 min-h-10 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-6 outline-none [field-sizing:content] placeholder:text-muted-foreground"
      />
      {canVoice ? (
        <button
          type="button"
          onClick={() => void toggleDictation()}
          disabled={dictating === "transcribing" || talk !== "off"}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
            dictating === "recording" ? "bg-error/10 text-error" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          aria-label={dictating === "recording" ? "Stop dictation" : "Dictate with your voice"}
          aria-pressed={dictating === "recording"}
          title="Dictate"
        >
          {dictating === "transcribing" ? (
            <Loader2 className="size-5 animate-spin" />
          ) : dictating === "recording" ? (
            <span className="relative flex size-5 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-error/30" style={{ transform: `scale(${1 + level * 1.6})` }} />
              <Square className="relative size-3 fill-current" />
            </span>
          ) : (
            <Mic className="size-5" />
          )}
        </button>
      ) : null}
      {generating ? (
        <button
          type="button"
          onClick={() => abort.current?.abort()}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background"
          aria-label="Stop"
        >
          <Square className="size-3.5 fill-current" />
        </button>
      ) : input.trim() ? (
        <button type="submit" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-label="Send">
          <ArrowUp className="size-5" />
        </button>
      ) : canVoice ? (
        <button
          type="button"
          onClick={startTalk}
          disabled={dictating !== "off"}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background hover:opacity-90"
          aria-label="Talk with the assistant"
          title="Talk"
        >
          <AudioLines className="size-5" />
        </button>
      ) : (
        <button type="submit" disabled className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-label="Send">
          <ArrowUp className="size-5" />
        </button>
      )}
    </form>
  );

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[26rem] gap-4">
      <aside aria-label="Chat history" className="hidden w-56 shrink-0 flex-col gap-1 overflow-y-auto lg:flex">
        <button type="button" onClick={newConversation} className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted">
          <Plus className="size-4" />
          New chat
        </button>
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            onClick={() => void openConversation(conversation.id)}
            aria-current={conversation.id === activeId ? "true" : undefined}
            className={cn(
              "flex items-center gap-2 truncate rounded-lg px-3 py-2 text-left text-sm",
              conversation.id === activeId ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <MessageSquare className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{conversation.title}</span>
          </button>
        ))}
      </aside>

      <section aria-label={name} className="relative flex min-w-0 flex-1 flex-col">
        {conversations.length ? (
          <div className="mb-2 flex items-center gap-2 lg:hidden">
            <select
              value={activeId === NEW ? "" : activeId}
              onChange={(event) => (event.target.value ? void openConversation(event.target.value) : newConversation())}
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-sm"
              aria-label="Chat history"
            >
              <option value="">New chat</option>
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  {conversation.title}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-2 pb-10">
            <h1 className="text-center font-display text-2xl font-semibold tracking-tight sm:text-3xl">{greeting}</h1>
            <div className="w-full max-w-2xl">{composer}</div>
            <ul className="flex w-full max-w-2xl flex-col">
              {suggestions.map((suggestion) => (
                <li key={suggestion.label}>
                  <button
                    type="button"
                    onClick={() => {
                      setInput(suggestion.prompt);
                      textarea.current?.focus();
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <span className="text-muted-foreground [&_svg]:size-4">{suggestion.icon}</span>
                    {suggestion.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-1 py-4">
                {loadingMessages ? (
                  <div className="flex flex-col gap-2" role="status" aria-label="Loading conversation">
                    <Skeleton className="ml-auto h-8 w-2/3 rounded-2xl" />
                    <Skeleton className="h-16 w-full rounded-xl" />
                  </div>
                ) : null}
                {messages.map((message) =>
                  message.role === "USER" ? (
                    <div key={message.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-3xl bg-muted px-4 py-2.5 text-[15px]">
                      {message.content}
                    </div>
                  ) : (
                    <div key={message.id} className="group flex flex-col gap-3">
                      <TutorMarkdown text={message.content} locale="en" />
                      <SourceList sources={message.sources} />
                      {message.actions?.map((action) => (
                        <ActionCard key={action.id} action={action} onChange={(next) => updateAction(message.id, next)} />
                      ))}
                      {canSpeak ? (
                        <button
                          type="button"
                          onClick={() => void speak(message.content)}
                          className="flex w-fit items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground opacity-70 hover:bg-muted hover:opacity-100"
                          aria-label="Read aloud"
                        >
                          <Volume2 className="size-3.5" />
                          Listen
                        </button>
                      ) : null}
                    </div>
                  )
                )}
                {streaming ? <TutorMarkdown text={streaming} locale="en" /> : null}
                {activity ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                    <Loader2 className="size-4 animate-spin" />
                    {activity}…
                  </p>
                ) : null}
                {status ? <AssistantStatus status={status} /> : null}
                <div ref={listEnd} />
              </div>
            </div>
            <div className="mx-auto w-full max-w-3xl pt-2">{composer}</div>
          </>
        )}

        {talk !== "off" ? (
          // Talk mode: a compact bar over the input, so answers and Confirm buttons stay visible and usable.
          <div
            className="absolute inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-3xl items-center gap-4 rounded-[1.75rem] border border-border bg-card p-3 shadow-panel"
            role="region"
            aria-label="Talking with the assistant"
          >
            <span className="relative flex size-12 shrink-0 items-center justify-center">
              <span
                className="absolute inset-0 rounded-full bg-primary/20 transition-transform duration-100"
                style={{ transform: `scale(${talk === "listening" ? 1 + level * 0.9 : talk === "speaking" ? 1.2 : 1})` }}
              />
              <span className={cn("relative flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground", talk === "thinking" || talk === "transcribing" ? "animate-pulse" : "")}>
                {talk === "speaking" ? <Volume2 className="size-5" /> : talk === "listening" ? <Mic className="size-5" /> : <Loader2 className="size-5 animate-spin" />}
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col" aria-live="polite">
              <span className="font-medium">
                {talk === "listening" ? "Listening…" : talk === "transcribing" ? "Got it…" : talk === "thinking" ? (activity ?? "Thinking…") : "Speaking…"}
              </span>
              <span className="truncate text-xs text-muted-foreground">Just talk, and pause when you&apos;re done. Confirm changes on screen.</span>
            </span>
            <button type="button" onClick={endTalk} className="flex shrink-0 items-center gap-2 rounded-full bg-error px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">
              <PhoneOff className="size-4" />
              End
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
