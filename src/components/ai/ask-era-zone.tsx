"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Languages, Send, Sparkles, Square, X } from "lucide-react";

import { SourceList, type SourceView } from "@/components/assistant/source-list";
import { TutorMarkdown } from "@/components/classroom/tutor-markdown";
import { buttonVariants } from "@/components/ui/button";
import {
  ASK_ERA_LABELS,
  ASK_ERA_LIMITS,
  askEraActions,
  type AskEraAction,
  type AskEraLanguage,
  type AskEraSelectionPayload,
  type AskEraSourceType,
  type AskEraWorkspace
} from "@/lib/ai/ask-era";
import { AgentStreamFailure, streamAgent } from "@/lib/ai/agent-stream";
import { cn } from "@/lib/utils";

/*
 * Ask ERA AI (docs/ERA_CONTEXTUAL_AI.md). Wrap a reading area with <AskEraZone>; selecting text inside it
 * shows a compact popup of actions. It is opt-in per area: never on the whole page, never inside inputs,
 * textareas, contenteditable regions or elements marked data-ask-era-ignore.
 *
 * - Student: `onAsk` hands the request to the classroom tutor panel (same conversation and history).
 * - Teacher / Admin: without `onAsk`, the answer streams into the popup and continues in the assistant page.
 * The server re-authorizes the source of every request; nothing here grants access.
 */

type AskEraZoneProps = {
  workspace: AskEraWorkspace;
  source: { type: AskEraSourceType; id?: string };
  locale?: "en" | "uz";
  onAsk?: (payload: AskEraSelectionPayload) => void;
  className?: string;
  children: React.ReactNode;
};

type Captured = { text: string; trimmed: boolean; rect: DOMRect; surrounding?: string };
type Mode =
  | { kind: "menu" }
  | { kind: "ask" }
  | { kind: "translate" }
  | { kind: "answer"; text: string; done: boolean; error?: string; sources?: SourceView[] };

const EDITABLE = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [data-ask-era-ignore]";
const BLOCK = "p, li, pre, td, th, blockquote, h1, h2, h3, h4, figcaption, section, article";

function isCompactScreen() {
  return typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 640);
}

function elementOf(node: Node | null) {
  return node ? (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement) : null;
}

export function AskEraZone({ workspace, source, locale = "en", onAsk, className, children }: AskEraZoneProps) {
  const t = ASK_ERA_LABELS[locale];
  const actions = askEraActions(workspace, source.type);
  const zone = React.useRef<HTMLDivElement>(null);
  const popup = React.useRef<HTMLDivElement>(null);
  const questionRef = React.useRef<HTMLInputElement>(null);
  const abort = React.useRef<AbortController | null>(null);
  /** True while a pointer is pressed inside the popup (touch taps can clear the page selection first). */
  const interacting = React.useRef(false);
  const [captured, setCaptured] = React.useState<Captured | null>(null);
  const [mode, setMode] = React.useState<Mode>({ kind: "menu" });
  const [question, setQuestion] = React.useState("");
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);
  const [compact, setCompact] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const pinned = mode.kind !== "menu";
  const storageKey = `era:ask-era:${workspace}`;

  React.useEffect(() => {
    try {
      setConversationId(window.sessionStorage.getItem(storageKey));
    } catch {}
  }, [storageKey]);

  const close = React.useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setCaptured(null);
    setMode({ kind: "menu" });
    setQuestion("");
    setPosition(null);
  }, []);

  /** Reads the current selection; shows the popup only for non-empty selections inside this zone. */
  const capture = React.useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const raw = selection.toString();
    if (!raw.trim()) return null;
    const range = selection.getRangeAt(0);
    const container = zone.current;
    if (!container || !container.contains(range.commonAncestorContainer)) return null;
    if (elementOf(range.startContainer)?.closest(EDITABLE) || elementOf(range.endContainer)?.closest(EDITABLE)) return null;

    const rects = range.getClientRects();
    const rect = range.getBoundingClientRect().width > 0 ? range.getBoundingClientRect() : rects[rects.length - 1];
    if (!rect) return null;
    const text = raw.trim();
    const block = elementOf(range.commonAncestorContainer)?.closest(BLOCK);
    const surroundingRaw = block && block !== container && container.contains(block) ? block.textContent?.trim() ?? "" : "";
    const surrounding = surroundingRaw && surroundingRaw !== text ? surroundingRaw.slice(0, ASK_ERA_LIMITS.maxSurrounding) : undefined;
    return {
      text: text.slice(0, ASK_ERA_LIMITS.maxSelection),
      trimmed: text.length > ASK_ERA_LIMITS.maxSelection,
      rect,
      surrounding
    } satisfies Captured;
  }, []);

  // Selection tracking. Listeners are passive; nothing prevents default selection, copy, links or scrolling.
  React.useEffect(() => {
    if (actions.length === 0) return;
    let timer: number | undefined;
    const evaluate = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (pinned || interacting.current) return;
        const next = capture();
        if (next) {
          setCaptured(next);
          setCompact(isCompactScreen());
        } else {
          setCaptured(null);
          setPosition(null);
        }
      }, 180);
    };
    document.addEventListener("selectionchange", evaluate);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("selectionchange", evaluate);
    };
  }, [actions.length, capture, pinned]);

  // Dismissal: Escape, a pointer down outside the popup (and outside a fresh selection), unmount/navigation.
  React.useEffect(() => {
    if (!captured) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        window.getSelection()?.removeAllRanges();
      } else if (event.altKey && (event.key === "a" || event.key === "A") && !pinned) {
        event.preventDefault();
        popup.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (popup.current?.contains(event.target as Node)) return;
      if (pinned) close();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [captured, close, pinned]);

  React.useEffect(() => () => abort.current?.abort(), []);

  // Placement: above the selection, flipped below when there is no room, clamped to the viewport.
  // Recomputed on scroll (including scrollable reading areas) and resize while visible.
  React.useLayoutEffect(() => {
    if (!captured || compact) return;
    const place = () => {
      const selection = window.getSelection();
      const live = selection && selection.rangeCount > 0 && !selection.isCollapsed ? selection.getRangeAt(0).getBoundingClientRect() : null;
      const rect = live && live.width > 0 ? live : captured.rect;
      const box = popup.current?.getBoundingClientRect();
      const width = box?.width ?? 320;
      const height = box?.height ?? 48;
      const margin = 8;
      let top = rect.top - height - margin;
      if (top < margin) top = rect.bottom + margin;
      top = Math.min(Math.max(top, margin), window.innerHeight - height - margin);
      const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, margin), window.innerWidth - width - margin);
      setPosition({ top, left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [captured, compact, mode]);

  React.useEffect(() => {
    if (mode.kind === "ask") questionRef.current?.focus();
  }, [mode.kind]);

  async function run(action: AskEraAction, extra: { question?: string; targetLanguage?: AskEraLanguage } = {}) {
    if (!captured) return;
    const payload: AskEraSelectionPayload = {
      action,
      selectedText: captured.text,
      sourceType: source.type,
      sourceId: source.id,
      surroundingText: captured.surrounding,
      ...extra
    };

    if (onAsk) {
      onAsk(payload);
      window.getSelection()?.removeAllRanges();
      close();
      return;
    }

    // Teacher / Admin: stream into the popup, in the same assistant conversation as earlier asks.
    const controller = new AbortController();
    abort.current = controller;
    setMode({ kind: "answer", text: "", done: false });
    try {
      const result = await streamAgent(
        "/api/ai/chat",
        { agent: workspace, selection: payload, ...(conversationId ? { conversationId } : {}) },
        controller.signal,
        {
          onDelta: (delta) => setMode((current) => (current.kind === "answer" ? { ...current, text: current.text + delta } : current)),
          onReset: () => setMode((current) => (current.kind === "answer" ? { ...current, text: "" } : current))
        }
      );
      const assistantMessage = result.messages.find((message) => message.role === "ASSISTANT");
      setMode({ kind: "answer", text: assistantMessage?.content ?? "", done: true, sources: assistantMessage?.sources });
      if (result.conversationId) {
        setConversationId(result.conversationId);
        try {
          window.sessionStorage.setItem(storageKey, result.conversationId);
        } catch {}
      }
    } catch (error) {
      const detail = error instanceof AgentStreamFailure ? error.detail : null;
      if (detail?.kind === "cancelled") return;
      if (detail?.kind === "forbidden" && conversationId) {
        // The remembered conversation is gone or not ours any more: start a fresh one next time.
        setConversationId(null);
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch {}
      }
      const message = detail && "message" in detail ? detail.message : "ERA couldn't answer. Please try again.";
      setMode({ kind: "answer", text: "", done: true, error: message });
    } finally {
      if (abort.current === controller) abort.current = null;
    }
  }

  function onToolbarKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const buttons = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>("[data-ask-era-action]") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    buttons[(index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }

  // Keeps the text selection while clicking popup buttons (desktop and touch).
  const keepSelection = (event: React.MouseEvent | React.PointerEvent) => {
    if (mode.kind === "menu" || mode.kind === "translate") event.preventDefault();
  };

  const assistantHref = conversationId ? `/${workspace === "admin" ? "admin" : "teacher"}/assistant?c=${conversationId}` : `/${workspace === "admin" ? "admin" : "teacher"}/assistant`;

  return (
    <div ref={zone} className={className} data-ask-era-zone={source.type}>
      {children}
      {captured && actions.length > 0 ? (
        <div
          ref={popup}
          role="dialog"
          aria-label={t.title}
          aria-keyshortcuts="Alt+A Escape"
          onMouseDown={keepSelection}
          onPointerDown={() => {
            interacting.current = true;
          }}
          onPointerUp={() => {
            window.setTimeout(() => {
              interacting.current = false;
            }, 400);
          }}
          className={cn(
            // Design-system tokens: card surface, panel shadow, overlay layer (above the tutor launcher, below toasts).
            "z-overlay flex flex-col gap-2 border border-border bg-card text-card-foreground shadow-panel",
            compact
              ? "fixed inset-x-2 bottom-2 max-h-[60vh] rounded-xl p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
              : "fixed max-w-[min(26rem,calc(100vw-1rem))] rounded-xl p-1.5",
            mode.kind === "answer" && !compact && "w-[26rem]"
          )}
          style={compact ? undefined : { top: position?.top ?? -9999, left: position?.left ?? -9999 }}
        >
          {mode.kind === "menu" ? (
            <div role="toolbar" aria-label={t.title} onKeyDown={onToolbarKey} className="flex flex-wrap items-center gap-1">
              <Sparkles className="ml-1 size-4 shrink-0 text-accent-strong" aria-hidden="true" />
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  data-ask-era-action={action}
                  onClick={() => (action === "ask" ? setMode({ kind: "ask" }) : action === "translate" ? setMode({ kind: "translate" }) : void run(action))}
                  className="min-h-8 rounded-lg px-2.5 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t[action]}
                </button>
              ))}
              <button type="button" onClick={close} aria-label={t.close} className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="size-4" />
              </button>
            </div>
          ) : null}

          {mode.kind === "ask" ? (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                void run("ask", question.trim() ? { question: question.trim() } : {});
              }}
            >
              <input
                ref={questionRef}
                value={question}
                maxLength={ASK_ERA_LIMITS.maxQuestion}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={t.askPlaceholder}
                aria-label={t.askPlaceholder}
                className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button type="submit" aria-label={t.send} className={cn(buttonVariants({ size: "sm" }), "h-8 px-2.5")}>
                <Send className="size-4" />
              </button>
              <button type="button" onClick={close} aria-label={t.close} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
                <X className="size-4" />
              </button>
            </form>
          ) : null}

          {mode.kind === "translate" ? (
            <div role="toolbar" aria-label={t.translateTo} onKeyDown={onToolbarKey} className="flex flex-wrap items-center gap-1">
              <Languages className="ml-1 size-4 text-muted-foreground" aria-hidden="true" />
              <span className="px-1 text-xs text-muted-foreground">{t.translateTo}</span>
              {(["uz", "en", "ru"] as AskEraLanguage[]).map((language) => (
                <button
                  key={language}
                  type="button"
                  data-ask-era-action={language}
                  onClick={() => void run("translate", { targetLanguage: language })}
                  className="min-h-8 rounded-lg px-2.5 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t.languages[language]}
                </button>
              ))}
              <button type="button" onClick={close} aria-label={t.close} className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>
          ) : null}

          {mode.kind === "answer" ? (
            <div className="flex min-h-0 flex-col gap-2 p-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Sparkles className="size-3.5 text-accent-strong" aria-hidden="true" />
                  {t.title}
                </p>
                <button type="button" onClick={close} aria-label={t.close} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
                  <X className="size-4" />
                </button>
              </div>
              <div className="max-h-[40vh] overflow-y-auto text-sm" aria-live="polite" aria-busy={!mode.done}>
                {mode.error ? (
                  <p className="text-sm text-error">{mode.error}</p>
                ) : (
                  <>
                    <TutorMarkdown text={mode.text || "…"} locale={locale} />
                    <SourceList sources={mode.sources} className="mt-2" />
                  </>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                {!mode.done ? (
                  <button type="button" onClick={() => abort.current?.abort()} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}>
                    <Square className="size-3.5" />
                    {t.stop}
                  </button>
                ) : (
                  <span />
                )}
                {mode.done && !mode.error ? (
                  <Link href={assistantHref} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8")}>
                    {t.openAssistant}
                    <ArrowRight className="size-3.5" />
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          {captured.trimmed && mode.kind !== "answer" ? <p className="px-2 pb-1 text-xs text-muted-foreground">{t.trimmed}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
