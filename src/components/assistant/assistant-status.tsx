"use client";

import { CircleAlert, Clock3, Lock, WifiOff } from "lucide-react";

import type { AssistantLocaleProps } from "@/components/assistant/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export type AssistantState =
  | { state: "thinking" }
  | { state: "rate-limited"; retryAfterSeconds: number }
  | { state: "quota-reached"; resetsAt: string }
  | { state: "offline" }
  | { state: "error"; onRetry?: () => void }
  | { state: "not-permitted" }
  | { state: "unavailable" };

const copy = {
  en: {
    thinking: "ERA is thinking…",
    rateLimited: (seconds: number) => `Too many questions in a row. Try again in ${seconds} seconds.`,
    quota: (time: string) => `You've reached today's ERA limit. It resets at ${time}.`,
    offline: "You're offline. ERA will be available when you reconnect.",
    error: "ERA couldn't answer that. Please try again.",
    retry: "Try again",
    notPermitted: "ERA isn't available for this lesson.",
    unavailable: "ERA is temporarily unavailable."
  },
  uz: {
    thinking: "ERA o'ylayapti…",
    rateLimited: (seconds: number) => `Ketma-ket juda ko'p savol berildi. ${seconds} soniyadan keyin qayta urinib ko'ring.`,
    quota: (time: string) => `Bugungi ERA limitiga yetdingiz. U ${time} da yangilanadi.`,
    offline: "Internet aloqasi yo'q. Qayta ulanganingizda ERA ishlaydi.",
    error: "ERA bu savolga javob bera olmadi. Qayta urinib ko'ring.",
    retry: "Qayta urinish",
    notPermitted: "Bu dars uchun ERA mavjud emas.",
    unavailable: "ERA vaqtincha ishlamayapti."
  }
};

/**
 * Inline status inside the assistant panel. Quota limits are configurable pilot defaults
 * (OD-12), so the reset time and wait come from the server, never from hard-coded values.
 */
export function AssistantStatus({ status, locale = "en" }: { status: AssistantState } & AssistantLocaleProps) {
  const t = copy[locale];
  const row = "flex items-start gap-2 rounded-lg px-3 py-2 text-sm";

  switch (status.state) {
    case "thinking":
      return (
        <p className={`${row} text-muted-foreground`} role="status">
          <Spinner className="mt-0.5" />
          {t.thinking}
        </p>
      );
    case "rate-limited":
      return (
        <p className={`${row} bg-warning/10 text-warning-foreground`} role="status">
          <Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t.rateLimited(status.retryAfterSeconds)}
        </p>
      );
    case "quota-reached":
      return (
        <p className={`${row} bg-warning/10 text-warning-foreground`} role="status">
          <Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t.quota(status.resetsAt)}
        </p>
      );
    case "offline":
      return (
        <p className={`${row} bg-muted text-muted-foreground`} role="status">
          <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t.offline}
        </p>
      );
    case "error":
      return (
        <div className={`${row} items-center justify-between bg-error/5 text-foreground`} role="alert">
          <span className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-error" aria-hidden="true" />
            {t.error}
          </span>
          {status.onRetry ? (
            <Button size="sm" variant="outline" onClick={status.onRetry}>
              {t.retry}
            </Button>
          ) : null}
        </div>
      );
    case "not-permitted":
      return (
        <p className={`${row} bg-muted text-muted-foreground`} role="status">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t.notPermitted}
        </p>
      );
    case "unavailable":
      return (
        <p className={`${row} bg-muted text-muted-foreground`} role="status">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t.unavailable}
        </p>
      );
    default: {
      const unhandled: never = status;
      return unhandled;
    }
  }
}
