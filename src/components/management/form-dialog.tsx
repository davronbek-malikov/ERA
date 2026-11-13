"use client";

import * as React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useT } from "@/components/i18n/locale-provider";

/**
 * A button that opens a small form in a dialog. `onSubmit` returns true to close it. Used by every
 * Student Management form so they look and behave the same (ERA Design System dialogs).
 */
export function FormDialog({
  triggerLabel,
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerIcon,
  title,
  description,
  submitLabel,
  destructive,
  wide,
  onOpen,
  onSubmit,
  children
}: {
  triggerLabel: string;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  triggerIcon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  submitLabel: string;
  destructive?: boolean;
  wide?: boolean;
  onOpen?: () => void;
  onSubmit: (form: FormData) => Promise<boolean>;
  children: React.ReactNode;
}) {
  const T = useT();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      if (await onSubmit(new FormData(event.currentTarget))) setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) onOpen?.();
      }}
    >
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          {triggerIcon}
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className={wide ? "max-h-[90vh] w-[min(calc(100vw-2rem),44rem)] overflow-y-auto" : "max-h-[90vh] overflow-y-auto"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate={false}>
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {T("Cancel")}
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending} aria-busy={pending}>
              {pending ? T("Saving…") : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function formString(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** "500,000" / "500000" → 500000; "" → null. */
export function formAmount(form: FormData, key: string): number | null {
  const raw = formString(form, key).replace(/[,\s₩]/g, "");
  if (!raw) return null;
  return /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
}
