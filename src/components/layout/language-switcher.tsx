"use client";

import { useTransition } from "react";

import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  locale: Locale;
  label: string;
  englishLabel: string;
  uzbekLabel: string;
};

export function LanguageSwitcher({
  locale,
  label,
  englishLabel,
  uzbekLabel
}: LanguageSwitcherProps) {
  const [isPending, startTransition] = useTransition();

  function setLocale(nextLocale: Locale) {
    startTransition(() => {
      void (async () => {
        await fetch("/api/locale", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ locale: nextLocale })
        });

        window.location.reload();
      })();
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full border border-border/80 bg-white/90 px-2 py-1 text-xs shadow-soft">
      <span className="px-2 uppercase tracking-[0.14em] whitespace-nowrap text-muted-foreground">{label}</span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setLocale("en")}
        className={cn(
          "whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-all",
          locale === "en"
            ? "bg-primary text-primary-foreground shadow-soft"
            : "text-muted-foreground hover:bg-secondary"
        )}
      >
        {englishLabel}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setLocale("uz")}
        className={cn(
          "whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-all",
          locale === "uz"
            ? "bg-primary text-primary-foreground shadow-soft"
            : "text-muted-foreground hover:bg-secondary"
        )}
      >
        {uzbekLabel}
      </button>
    </div>
  );
}
