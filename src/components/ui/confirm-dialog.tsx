"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";

export type ConfirmImpactItem = { label: string; count: number };

type ConfirmDialogProps = {
  trigger: React.ReactElement;
  /** Phrase it as a question: "Delete this lesson?" */
  title: string;
  /** The consequence in plain words. */
  description: React.ReactNode;
  /** Name the action: "Delete lesson", never "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /**
   * Impact level: counts loaded from the server before the action is allowed.
   * Pass `null` while they load; the confirm button stays disabled until they arrive.
   */
  impact?: ConfirmImpactItem[] | null;
  /** Typed level: the exact text the user must type, for example the course title. */
  confirmPhrase?: string;
  /** Called on confirm. Use for client-side flows. */
  onConfirm?: () => void | Promise<void>;
  /** Or submit a server action with hidden fields. */
  formAction?: (formData: FormData) => void | Promise<void>;
  fields?: Record<string, string>;
  /** Called when the dialog opens, for example to start loading impact counts. */
  onOpen?: () => void;
};

/**
 * Confirmation dialog with three levels (docs/ERA_INFORMATION_ARCHITECTURE.md §2.6, §9.9):
 * standard (question + consequence), impact (adds server counts), typed (adds a typed phrase).
 * This is a UX safeguard only: the server must still authorize the action.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  impact,
  confirmPhrase,
  onConfirm,
  formAction,
  fields,
  onOpen
}: ConfirmDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const phraseId = React.useId();

  const usesImpact = impact !== undefined;
  const impactLoading = usesImpact && impact === null;
  const phraseMatches = !confirmPhrase || typed.trim() === confirmPhrase;
  const canConfirm = phraseMatches && !impactLoading && !pending;

  async function handleConfirm() {
    if (!onConfirm || !canConfirm) {
      return;
    }

    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  const confirmButton = (
    <Button
      type={formAction ? "submit" : "button"}
      variant={destructive ? "destructive" : "primary"}
      disabled={!canConfirm}
      loading={pending}
      onClick={formAction ? undefined : handleConfirm}
    >
      {confirmLabel}
    </Button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setTyped("");
        if (next) {
          onOpen?.();
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* Radix focuses the first focusable element: the phrase field when there is one,
          otherwise Cancel (first in DOM order). The destructive button is never the default. */}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div>{description}</div>
          </DialogDescription>
        </DialogHeader>

        {usesImpact ? (
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">This will affect</p>
            {impactLoading ? (
              <div className="flex flex-col gap-2" aria-live="polite" aria-busy="true">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <span className="sr-only">Loading what this affects</span>
              </div>
            ) : impact && impact.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm">
                {impact.map((item) => (
                  <li key={item.label} className="flex justify-between gap-4">
                    <span>{item.label}</span>
                    <span className="font-medium tabular-nums">{item.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">Nothing else is affected.</p>
            )}
          </div>
        ) : null}

        {confirmPhrase ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={phraseId} className="text-sm">
              Type <span className="font-semibold">{confirmPhrase}</span> to confirm
            </label>
            <Input
              id={phraseId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {cancelLabel}
            </Button>
          </DialogClose>
          {formAction ? (
            <form action={formAction}>
              {Object.entries(fields ?? {}).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              {confirmButton}
            </form>
          ) : (
            confirmButton
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
