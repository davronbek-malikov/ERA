"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  locale: Locale;
  label: string;
  englishLabel: string;
  uzbekLabel: string;
  compact?: boolean;
};

export function LanguageSwitcher({
  locale,
  label,
  englishLabel,
  uzbekLabel,
  compact = false
}: LanguageSwitcherProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

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

        router.prefetch(pathname);
        router.refresh();
      })();
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-card/90 px-2 py-1 text-xs shadow-soft">
      {!compact ? (
        <span className="px-2 whitespace-nowrap uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
      ) : null}
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
