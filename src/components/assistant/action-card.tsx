"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, Clock3, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/locale-provider";

/*
 * A change proposed by the ERA Assistant (Student Management). It is only a preview: nothing happens until the
 * user presses Confirm, and the server then runs it once with the user's current permissions.
 */

export type ActionCardView = {
  id: string;
  kind: string;
  title: string;
  lines: Array<{ label: string; value: string }>;
  warnings: string[];
  status: "PENDING" | "EXECUTING" | "EXECUTED" | "CANCELLED" | "FAILED" | "EXPIRED";
  resultMessage?: string | null;
  expiresAt: string;
};

const STATUS: Record<ActionCardView["status"], { label: string; variant: "neutral" | "primary" | "success" | "warning" | "error" }> = {
  PENDING: { label: "Waiting for your confirmation", variant: "warning" },
  EXECUTING: { label: "Working…", variant: "primary" },
  EXECUTED: { label: "Done", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "neutral" },
  FAILED: { label: "Not done", variant: "error" },
  EXPIRED: { label: "Expired", variant: "neutral" }
};

export function ActionCard({ action, onChange }: { action: ActionCardView; onChange: (next: ActionCardView) => void }) {
  const T = useT();
  const [busy, setBusy] = React.useState<"confirm" | "cancel" | null>(null);
  const status = STATUS[action.status];
  const pending = action.status === "PENDING";

  async function decide(decision: "confirm" | "cancel") {
    setBusy(decision);
    try {
      const response = await fetch(`/api/ai/actions/${action.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision })
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; action?: ActionCardView; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.action) {
        if (response.status === 409) onChange({ ...action, status: "EXPIRED", resultMessage: payload?.error ?? null });
        toast({ title: payload?.error ?? T("That didn't work. Please try again."), variant: "error" });
        return;
      }
      onChange(payload.action);
      if (payload.action.status === "EXECUTED") toast({ title: payload.action.resultMessage ?? T("Done."), variant: "success" });
      if (payload.action.status === "FAILED") toast({ title: payload.action.resultMessage ?? T("Not done."), variant: "error" });
    } catch {
      toast({ title: T("You seem to be offline. Nothing was changed."), variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-label={`Proposed change: ${action.title}`}
      className={cn("flex flex-col gap-3 rounded-xl border bg-surface p-4", pending ? "border-warning/40" : "border-border")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 shrink-0 text-accent-strong" aria-hidden="true" />
          {action.title}
        </h3>
        <Badge variant={status.variant}>{T(status.label)}</Badge>
      </div>

      <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[minmax(8rem,auto),1fr]">
        {action.lines.map((line) => (
          <React.Fragment key={line.label}>
            <dt className="text-muted-foreground">{line.label}</dt>
            <dd className="min-w-0 break-words font-medium">{line.value}</dd>
          </React.Fragment>
        ))}
      </dl>

      {action.warnings.length ? (
        <ul className="flex flex-col gap-1">
          {action.warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      {action.resultMessage && !pending ? (
        <p className="flex items-start gap-2 text-sm">
          {action.status === "EXECUTED" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          ) : action.status === "FAILED" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-error" aria-hidden="true" />
          ) : (
            <CircleSlash className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          {action.resultMessage}
        </p>
      ) : null}

      {pending ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void decide("confirm")} disabled={busy !== null} aria-busy={busy === "confirm"}>
            {busy === "confirm" ? T("Confirming…") : T("Confirm")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void decide("cancel")} disabled={busy !== null}>
            {T("Cancel")}
          </Button>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" aria-hidden="true" />
            {T("Nothing changes until you confirm.")}
          </span>
        </div>
      ) : null}
    </section>
  );
}
