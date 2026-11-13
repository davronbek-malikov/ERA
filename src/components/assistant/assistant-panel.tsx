"use client";

import * as React from "react";
import { History, Maximize2, Minimize2, PanelRightClose, Plus, Sparkles, X } from "lucide-react";

import { ContextChip } from "@/components/assistant/context-chip";
import type { AssistantContextChip, AssistantKind, AssistantLocaleProps } from "@/components/assistant/types";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const copy = {
  en: {
    names: { "student-tutor": "ERA Tutor", "teacher-assistant": "ERA Assistant", "admin-assistant": "Admin Assistant" },
    open: { "student-tutor": "Ask ERA", "teacher-assistant": "ERA Assistant", "admin-assistant": "Assistant" },
    privacy: {
      "student-tutor": "Only you can see this conversation. Your teacher can't.",
      "teacher-assistant": "ERA Assistant uses only your own courses.",
      "admin-assistant": "Aggregate data only. No private conversations."
    },
    canSee: "Can see",
    collapse: "Collapse",
    close: "Close",
    newConversation: "New conversation",
    history: "History",
    expand: "Expand",
    shrink: "Shrink"
  },
  uz: {
    names: { "student-tutor": "ERA Tutor", "teacher-assistant": "ERA Assistant", "admin-assistant": "Admin yordamchisi" },
    open: { "student-tutor": "ERAdan so'rash", "teacher-assistant": "ERA Assistant", "admin-assistant": "Yordamchi" },
    privacy: {
      "student-tutor": "Bu suhbatni faqat siz ko'rasiz. O'qituvchingiz ko'ra olmaydi.",
      "teacher-assistant": "ERA Assistant faqat sizning kurslaringizdan foydalanadi.",
      "admin-assistant": "Faqat umumlashtirilgan ma'lumotlar. Shaxsiy suhbatlar yo'q."
    },
    canSee: "Ko'radi",
    collapse: "Yig'ish",
    close: "Yopish",
    newConversation: "Yangi suhbat",
    history: "Tarix",
    expand: "Kattalashtirish",
    shrink: "Kichraytirish"
  }
};

export type SheetHeight = "peek" | "half" | "full";

type AssistantPanelProps = AssistantLocaleProps & {
  kind: AssistantKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Context the server authorized for this page. Shown so users know what the assistant sees. */
  contextChips?: AssistantContextChip[];
  /** The conversation (AssistantMessage list and AssistantStatus). */
  children: React.ReactNode;
  /** An AssistantComposer. Its footnote should be the privacy line (see privacyNote). */
  composer: React.ReactNode;
  onNewConversation?: () => void;
  onOpenHistory?: () => void;
  /**
   * Text for the polite live region. Set it once per finished answer, never on every
   * streamed token, so screen readers announce each answer once.
   */
  announcement?: string;
  /** Distance of the mobile launcher from the bottom, so it sits above a tab bar. */
  mobileLauncherOffset?: "default" | "above-tab-bar";
};

/** The privacy line for each assistant, for the composer footnote. */
export function privacyNote(kind: AssistantKind, locale: AssistantLocaleProps["locale"] = "en") {
  return copy[locale].privacy[kind];
}

const sheetHeights: Record<SheetHeight, string> = {
  peek: "h-[9.5rem]",
  half: "h-[50vh]",
  full: "h-[92vh]"
};

/**
 * One panel pattern for all three assistants (docs/ERA_INFORMATION_ARCHITECTURE.md §9.10):
 * - Wide (≥1280px): docked beside the content (place it inside AppShell's `assistant` slot);
 *   collapses to a 56px rail.
 * - Tablet and desktop (768–1279px): overlays the content from the right; collapses to a
 *   floating button.
 * - Phones: a bottom sheet with peek, half and full heights, changed with buttons (no
 *   gesture is required). Collapses to a floating button.
 */
export function AssistantPanel({
  kind,
  open,
  onOpenChange,
  contextChips = [],
  children,
  composer,
  onNewConversation,
  onOpenHistory,
  announcement,
  mobileLauncherOffset = "default",
  locale = "en"
}: AssistantPanelProps) {
  const t = copy[locale];
  const name = t.names[kind];
  const [sheetHeight, setSheetHeight] = React.useState<SheetHeight>("half");
  const panelRef = React.useRef<HTMLElement>(null);
  const railLauncherRef = React.useRef<HTMLButtonElement>(null);
  const floatingLauncherRef = React.useRef<HTMLButtonElement>(null);
  const headingId = React.useId();
  const wasOpen = React.useRef(open);

  // Move focus into the composer on open, and back to the launcher on close.
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      panelRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    }
    if (!open && wasOpen.current) {
      // Only one launcher is visible at a time; focus that one.
      const visible = [railLauncherRef.current, floatingLauncherRef.current].find(
        (element) => element && element.getClientRects().length > 0
      );
      visible?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  const header = (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-accent-strong" aria-hidden="true" />
        <h2 id={headingId} className="text-sm font-semibold">
          {name}
        </h2>
        <div className="ml-auto flex items-center">
          {onNewConversation ? (
            <Tooltip content={t.newConversation}>
              <Button variant="ghost" size="icon-sm" aria-label={t.newConversation} onClick={onNewConversation}>
                <Plus />
              </Button>
            </Tooltip>
          ) : null}
          {onOpenHistory ? (
            <Tooltip content={t.history}>
              <Button variant="ghost" size="icon-sm" aria-label={t.history} onClick={onOpenHistory}>
                <History />
              </Button>
            </Tooltip>
          ) : null}
          {/* Phones: expand or shrink the sheet with buttons. */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label={sheetHeight === "full" ? t.shrink : t.expand}
            onClick={() => setSheetHeight((height) => (height === "full" ? "half" : "full"))}
          >
            {sheetHeight === "full" ? <Minimize2 /> : <Maximize2 />}
          </Button>
          <Tooltip content={t.collapse}>
            <Button variant="ghost" size="icon-sm" aria-label={t.close} onClick={() => onOpenChange(false)}>
              <X className="md:hidden" />
              <PanelRightClose className="hidden md:block" />
            </Button>
          </Tooltip>
        </div>
      </div>
      {contextChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t.canSee}:</span>
          {contextChips.map((chip) => (
            <ContextChip key={chip.id} chip={{ ...chip, removable: false }} />
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {open ? (
        <aside
          ref={panelRef}
          role="complementary"
          aria-labelledby={headingId}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onOpenChange(false);
            }
          }}
          className={cn(
            "z-assistant flex flex-col bg-card",
            // Phones: bottom sheet.
            "fixed inset-x-0 bottom-0 rounded-t-2xl border-t border-border pb-[env(safe-area-inset-bottom)] shadow-panel",
            sheetHeights[sheetHeight],
            // Tablet and desktop: right overlay under the top bar.
            "md:bottom-0 md:left-auto md:right-0 md:top-header md:h-auto md:w-assistant md:rounded-none md:border-l md:border-t-0 md:pb-0",
            // Wide: docked in the layout.
            "xl:sticky xl:top-header xl:h-[calc(100vh-var(--header-height))] xl:shrink-0 xl:shadow-none"
          )}
        >
          {/* Phones: the handle cycles the sheet height; it's a real button, not just a gesture. */}
          <button
            type="button"
            className="mx-auto flex h-6 w-16 items-center justify-center md:hidden"
            aria-label={sheetHeight === "peek" ? t.expand : t.shrink}
            onClick={() =>
              setSheetHeight((height) => (height === "peek" ? "half" : height === "half" ? "full" : "peek"))
            }
          >
            <span className="h-1 w-10 rounded-full bg-border" aria-hidden="true" />
          </button>
          {header}
          <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-4", sheetHeight === "peek" && "hidden md:block")}>
            <div className="flex flex-col gap-5">{children}</div>
          </div>
          <div className="border-t border-border p-3">{composer}</div>
        </aside>
      ) : (
        <>
          {/* Wide: collapsed rail. */}
          <div className="sticky top-header hidden h-[calc(100vh-var(--header-height))] w-assistant-rail shrink-0 flex-col items-center border-l border-border bg-card py-3 xl:flex">
            <Tooltip content={t.open[kind]} side="left">
              <Button ref={railLauncherRef} variant="ghost" size="icon" aria-label={t.open[kind]} onClick={() => onOpenChange(true)}>
                <Sparkles className="text-accent-strong" />
              </Button>
            </Tooltip>
          </div>
          {/* Phones to desktop: floating launcher. */}
          <Button
            ref={floatingLauncherRef}
            className={cn(
              "fixed right-4 z-assistant shadow-panel xl:hidden",
              mobileLauncherOffset === "above-tab-bar" ? "bottom-20 md:bottom-6" : "bottom-6"
            )}
            onClick={() => onOpenChange(true)}
          >
            <Sparkles />
            {t.open[kind]}
          </Button>
        </>
      )}
    </>
  );
}
