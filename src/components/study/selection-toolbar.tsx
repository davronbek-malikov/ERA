"use client";

import * as React from "react";
import { Check, ChevronDown, Copy, Highlighter, Link2, MessageCircleQuestion, NotebookPen, Sparkles, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * Selection toolbar of the study room (docs/ERA_STUDY_ROOM.md), like a reading app's:
 *   ✨ Explain this concept · ● color · Highlight · Add note · Ask · Copy · Link
 * Highlights are drawn with the CSS Custom Highlight API (no change to the lesson's DOM, so React never fights
 * it). Each highlight is stored as { sectionId, start, quote }: the offset of the quote in the section's text.
 */

export const COLORS = ["yellow", "green", "blue", "pink"] as const;
export type HighlightColor = (typeof COLORS)[number];
export const COLOR_SWATCH: Record<HighlightColor, string> = { yellow: "#fde047", green: "#86efac", blue: "#93c5fd", pink: "#f9a8d4" };

export type Annotation = { id: string; sectionId: string; quote: string; start: number; color: string; note: string | null; createdAt: string };
export type SelectionInfo = { sectionId: string | null; quote: string; start: number; rect: DOMRect };

export const TOOLBAR_COPY = {
  uz: {
    explain: "Tushuntirib ber",
    highlight: "Belgilash",
    note: "Izoh",
    ask: "Savol",
    copy: "Nusxa",
    link: "Havola",
    notePlaceholder: "Izohingizni yozing…",
    save: "Saqlash",
    cancel: "Bekor qilish",
    remove: "O'chirish",
    color: "Rang",
    copied: "Nusxa olindi",
    linkCopied: "Havola nusxalandi",
    onlyInText: "Belgilash va izoh faqat dars matnida ishlaydi"
  },
  en: {
    explain: "Explain this concept",
    highlight: "Highlight",
    note: "Add note",
    ask: "Ask",
    copy: "Copy",
    link: "Link",
    notePlaceholder: "Write your note…",
    save: "Save",
    cancel: "Cancel",
    remove: "Delete",
    color: "Color",
    copied: "Copied",
    linkCopied: "Link copied",
    onlyInText: "Highlights and notes work in the lesson text"
  }
} as const;
type ToolbarCopy = Record<keyof (typeof TOOLBAR_COPY)["uz"], string>;

// ------------------------------------------------------------------------------------------------
// Text offsets ↔ DOM ranges
// ------------------------------------------------------------------------------------------------

function textNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  return nodes;
}

/** Where the selection starts in the section's text, and the selected text (both measured the same way). */
export function describeSelection(selection: Selection): SelectionInfo | null {
  if (!selection.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const quote = range.toString();
  if (quote.trim().length < 2) return null;
  const startEl = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const endEl = range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
  if (!startEl?.closest("[data-study-article]")) return null;
  const startBody = startEl.closest<HTMLElement>("[data-section-body]");
  const endBody = endEl?.closest<HTMLElement>("[data-section-body]");
  const rect = range.getBoundingClientRect();
  if (!startBody || startBody !== endBody) return { sectionId: null, quote: quote.slice(0, 2000), start: 0, rect };
  const before = document.createRange();
  before.setStart(startBody, 0);
  before.setEnd(range.startContainer, range.startOffset);
  return { sectionId: startBody.dataset.sectionBody ?? null, quote: quote.slice(0, 1000), start: before.toString().length, rect };
}

/** The DOM range of a saved highlight, or null when the text can't be found any more. */
export function locateRange(body: HTMLElement, start: number, quote: string): Range | null {
  const text = body.textContent ?? "";
  let index = text.slice(start, start + quote.length) === quote ? start : text.indexOf(quote);
  if (index < 0) {
    // Whitespace may differ slightly: retry on the first 40 characters.
    const head = quote.slice(0, 40);
    index = head.length >= 4 ? text.indexOf(head) : -1;
    if (index < 0) return null;
  }
  const end = Math.min(index + quote.length, text.length);
  const range = document.createRange();
  let offset = 0;
  let started = false;
  for (const node of textNodes(body)) {
    const length = node.data.length;
    if (!started && index <= offset + length) {
      range.setStart(node, index - offset);
      started = true;
    }
    if (started && end <= offset + length) {
      range.setEnd(node, end - offset);
      return range;
    }
    offset += length;
  }
  return null;
}

type HighlightRegistry = { set(name: string, value: unknown): void; delete(name: string): void };
type HighlightCtor = new (...ranges: Range[]) => unknown;

/** Draws the highlights (one CSS highlight per color, plus an underline for notes). Returns id → range. */
export function paintHighlights(article: HTMLElement | null, annotations: Annotation[]): Map<string, Range> {
  const ranges = new Map<string, Range>();
  const registry = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS?.highlights;
  const HighlightClass = (globalThis as { Highlight?: HighlightCtor }).Highlight;
  if (!article) return ranges;
  for (const annotation of annotations) {
    const body = article.querySelector<HTMLElement>(`[data-section-body="${CSS.escape(annotation.sectionId)}"]`);
    const range = body ? locateRange(body, annotation.start, annotation.quote) : null;
    if (range) ranges.set(annotation.id, range);
  }
  if (!registry || !HighlightClass) return ranges;
  for (const color of COLORS) {
    const list = annotations.filter((annotation) => (annotation.color === color || (!COLORS.includes(annotation.color as HighlightColor) && color === "yellow")) && ranges.has(annotation.id));
    if (list.length) registry.set(`era-${color}`, new HighlightClass(...list.map((annotation) => ranges.get(annotation.id)!)));
    else registry.delete(`era-${color}`);
  }
  const noted = annotations.filter((annotation) => annotation.note && ranges.has(annotation.id));
  if (noted.length) registry.set("era-note", new HighlightClass(...noted.map((annotation) => ranges.get(annotation.id)!)));
  else registry.delete("era-note");
  return ranges;
}

export function clearHighlights() {
  const registry = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS?.highlights;
  for (const name of [...COLORS.map((color) => `era-${color}`), "era-note"]) registry?.delete(name);
}

/** A share link that opens the page scrolled to (and marking) the selected text (URL text fragment). */
export function textFragmentLink(quote: string) {
  const clean = quote.replace(/\s+/g, " ").trim();
  const words = clean.split(" ");
  const fragment = clean.length <= 80 || words.length <= 10 ? encodeURIComponent(clean) : `${encodeURIComponent(words.slice(0, 5).join(" "))},${encodeURIComponent(words.slice(-5).join(" "))}`;
  return `${window.location.origin}${window.location.pathname}${window.location.search}#:~:text=${fragment}`;
}

// ------------------------------------------------------------------------------------------------
// UI
// ------------------------------------------------------------------------------------------------

function position(rect: DOMRect, width: number, below: boolean) {
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8));
  const top = below ? rect.bottom + 10 : rect.top - 10;
  return { left, top, transform: below ? undefined : "translateY(-100%)" };
}

function ColorPicker({ value, onChange, t }: { value: HighlightColor; onChange: (color: HighlightColor) => void; t: ToolbarCopy }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex h-9 items-center gap-1 rounded-md px-2 hover:bg-white/10" aria-label={t.color} aria-expanded={open}>
        <span className="size-4 rounded-full border border-white/40" style={{ background: COLOR_SWATCH[value] }} />
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-10 mt-1 flex gap-1.5 rounded-lg bg-neutral-800 p-2 shadow-lg">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                onChange(color);
                setOpen(false);
              }}
              className="flex size-6 items-center justify-center rounded-full border border-white/30"
              style={{ background: COLOR_SWATCH[color] }}
              aria-label={color}
            >
              {value === color ? <Check className="size-3.5 text-neutral-900" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const ITEM = "flex h-9 items-center gap-1.5 rounded-md px-1.5 text-sm hover:bg-white/10 disabled:opacity-40 sm:px-2.5";

export function SelectionToolbar({
  info,
  language,
  color,
  onColor,
  onExplain,
  onHighlight,
  onNote,
  onAsk,
  onCopy,
  onLink,
  onClose,
  onPin
}: {
  info: SelectionInfo;
  language: "uz" | "en";
  color: HighlightColor;
  onColor: (color: HighlightColor) => void;
  onExplain: () => void;
  onHighlight: () => void;
  onNote: (note: string) => Promise<void> | void;
  onAsk: () => void;
  onCopy: () => void;
  onLink: () => void;
  onClose: () => void;
  onPin: (pinned: boolean) => void;
}) {
  const t = TOOLBAR_COPY[language];
  const [noting, setNoting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const width = noting ? 320 : 470;
  const canMark = Boolean(info.sectionId);

  return (
    <div
      role="toolbar"
      aria-label={t.explain}
      style={{ position: "fixed", zIndex: 60, maxWidth: "calc(100vw - 16px)", ...position(info.rect, Math.min(width, window.innerWidth - 16), coarse) }}
      className="flex flex-col overflow-visible rounded-xl bg-neutral-900 text-white shadow-2xl"
      // Keep the text selected while the toolbar is used (except inside the note box, which needs focus).
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLTextAreaElement)) event.preventDefault();
      }}
    >
      {noting ? (
        <div className="flex w-[320px] max-w-full flex-col gap-2 p-3">
          <p className="line-clamp-2 border-l-2 border-white/40 pl-2 text-xs text-white/70">{info.quote}</p>
          <textarea
            autoFocus
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={t.notePlaceholder}
            className="w-full rounded-md bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/40"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={ITEM}
              onClick={() => {
                setNoting(false);
                onPin(false);
                onClose();
              }}
            >
              {t.cancel}
            </button>
            <button type="button" className={cn(ITEM, "bg-white text-neutral-900 hover:bg-white/90")} disabled={!note.trim()} onClick={() => onNote(note.trim())}>
              {t.save}
            </button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" onClick={onExplain} className="flex items-center gap-2 border-b border-white/15 px-3 py-2.5 text-left text-sm font-semibold hover:bg-white/10">
            <Sparkles className="size-4" aria-hidden="true" />
            {t.explain}
          </button>
          <div className="flex flex-wrap items-center gap-0.5 p-1">
            <ColorPicker value={color} onChange={onColor} t={t} />
            <button type="button" className={ITEM} onClick={onHighlight} disabled={!canMark} title={canMark ? undefined : t.onlyInText}>
              <Highlighter className="size-4" aria-hidden="true" />
              {t.highlight}
            </button>
            <button
              type="button"
              className={ITEM}
              disabled={!canMark}
              title={canMark ? undefined : t.onlyInText}
              onClick={() => {
                onPin(true);
                setNoting(true);
              }}
            >
              <NotebookPen className="size-4" aria-hidden="true" />
              {t.note}
            </button>
            <button type="button" className={ITEM} onClick={onAsk}>
              <MessageCircleQuestion className="size-4" aria-hidden="true" />
              {t.ask}
            </button>
            <button type="button" className={ITEM} onClick={onCopy} aria-label={t.copy}>
              <Copy className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t.copy}</span>
            </button>
            <button type="button" className={ITEM} onClick={onLink} aria-label={t.link}>
              <Link2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Opened by clicking an existing highlight: change its color, edit its note, explain it, or delete it. */
export function HighlightPopover({
  annotation,
  rect,
  language,
  onColor,
  onSaveNote,
  onExplain,
  onDelete,
  onClose
}: {
  annotation: Annotation;
  rect: DOMRect;
  language: "uz" | "en";
  onColor: (color: HighlightColor) => void;
  onSaveNote: (note: string | null) => void;
  onExplain: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = TOOLBAR_COPY[language];
  const [note, setNote] = React.useState(annotation.note ?? "");
  const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  return (
    <div role="dialog" aria-label={t.note} style={{ position: "fixed", zIndex: 60, ...position(rect, 320, coarse) }} className="flex w-[320px] max-w-[calc(100vw-16px)] flex-col gap-2 rounded-xl bg-neutral-900 p-3 text-white shadow-2xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {COLORS.map((color) => (
            <button key={color} type="button" onClick={() => onColor(color)} className="flex size-6 items-center justify-center rounded-full border border-white/30" style={{ background: COLOR_SWATCH[color] }} aria-label={color}>
              {annotation.color === color ? <Check className="size-3.5 text-neutral-900" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-white/10" aria-label={t.cancel}>
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={2000} placeholder={t.notePlaceholder} className="w-full rounded-md bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/40" />
      <div className="flex flex-wrap items-center justify-between gap-1">
        <div className="flex gap-1">
          <button type="button" className={ITEM} onClick={onExplain}>
            <Sparkles className="size-4" aria-hidden="true" />
            {t.explain}
          </button>
          <button type="button" className={cn(ITEM, "text-red-300")} onClick={onDelete}>
            <Trash2 className="size-4" aria-hidden="true" />
            {t.remove}
          </button>
        </div>
        <button type="button" className={cn(ITEM, "bg-white text-neutral-900 hover:bg-white/90")} disabled={(note.trim() || null) === (annotation.note ?? null)} onClick={() => onSaveNote(note.trim() || null)}>
          {t.save}
        </button>
      </div>
    </div>
  );
}
