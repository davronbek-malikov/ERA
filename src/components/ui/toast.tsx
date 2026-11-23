"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type ToastVariant = "info" | "success" | "error";

export type ToastOptions = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Optional single action, for example Undo. */
  action?: { label: string; onClick: () => void };
};

type ToastItem = ToastOptions & { id: number };

// A tiny module-level store so any client component can call toast() without context wiring.
let nextId = 1;
let items: ToastItem[] = [];
const listeners = new Set<(items: ToastItem[]) => void>();

function emit() {
  for (const listener of listeners) {
    listener(items);
  }
}

/** Show a short confirmation, for example "Saved" or "Course published". */
export function toast(options: ToastOptions) {
  items = [...items, { ...options, id: nextId++ }];
  emit();
}

function dismiss(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

const icons: Record<ToastVariant, React.ReactNode> = {
  info: <Info className="size-4 text-primary" aria-hidden="true" />,
  success: <CheckCircle2 className="size-4 text-success" aria-hidden="true" />,
  error: <CircleAlert className="size-4 text-error" aria-hidden="true" />
};

/** Mounted once in the root layout. */
export function Toaster() {
  const [current, setCurrent] = React.useState<ToastItem[]>(items);

  React.useEffect(() => {
    listeners.add(setCurrent);
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);

  return (
    <ToastPrimitive.Provider duration={5000} swipeDirection="right">
      {current.map((item) => {
        const variant = item.variant ?? "info";

        return (
          <ToastPrimitive.Root
            key={item.id}
            type={variant === "error" ? "foreground" : "background"}
            onOpenChange={(open) => {
              if (!open) {
                dismiss(item.id);
              }
            }}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm shadow-panel",
              "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
              "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=end]:animate-out"
            )}
          >
            <span className="mt-0.5">{icons[variant]}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <ToastPrimitive.Title className="font-medium text-foreground">{item.title}</ToastPrimitive.Title>
              {item.description ? (
                <ToastPrimitive.Description className="text-muted-foreground">
                  {item.description}
                </ToastPrimitive.Description>
              ) : null}
            </div>
            {item.action ? (
              <ToastPrimitive.Action
                altText={item.action.label}
                onClick={item.action.onClick}
                className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.action.label}
              </ToastPrimitive.Action>
            ) : null}
            <ToastPrimitive.Close
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Dismiss"
            >
              <X className="size-4" aria-hidden="true" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      {/* Bottom-right on desktop, top on phones (above the mobile tab bar area). */}
      <ToastPrimitive.Viewport className="fixed inset-x-0 top-0 z-toast flex max-h-screen flex-col gap-2 p-4 outline-none sm:inset-x-auto sm:bottom-0 sm:right-0 sm:top-auto sm:w-[24rem]" />
    </ToastPrimitive.Provider>
  );
}
