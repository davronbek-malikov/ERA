"use client";

import * as React from "react";
import { BadgeCheck, Ban, HandCoins, PencilLine, Undo2 } from "lucide-react";

import { FormDialog, formAmount, formString } from "@/components/management/form-dialog";
import { newIdempotencyKey, useManagementMutation } from "@/components/management/use-mutation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { Workspace } from "@/components/management/enrollment-forms";
import { useT } from "@/components/i18n/locale-provider";

/*
 * Manual payment verification (Student Management). Recording creates a PENDING transaction; only an approval
 * makes it count. Corrections keep the original and add a linked new record. Nothing is ever deleted.
 */

export function RecordPaymentButton({
  enrollmentId,
  workspace,
  today,
  label = "Record payment",
  currency = "KRW"
}: {
  enrollmentId: string;
  workspace: Workspace;
  today: string;
  label?: string;
  currency?: string;
}) {
  const T = useT();
  const { run } = useManagementMutation();
  const [key, setKey] = React.useState(newIdempotencyKey);

  async function submit(form: FormData) {
    const amount = formAmount(form, "amount");
    if (!amount || Number.isNaN(amount)) {
      toast({ title: T("Enter the amount as a whole number of won, e.g. 100000."), variant: "error" });
      return false;
    }
    const result = await run(
      "/api/management/payments",
      "POST",
      {
        workspace,
        enrollmentId,
        kind: formString(form, "kind") || "PAYMENT",
        amount,
        currency,
        method: formString(form, "method"),
        transactionDate: formString(form, "transactionDate"),
        reference: formString(form, "reference") || null,
        description: formString(form, "description") || null,
        idempotencyKey: key
      },
      "Payment recorded. It is pending until approved."
    );
    if (result) setKey(newIdempotencyKey());
    return Boolean(result);
  }

  return (
    <FormDialog
      triggerLabel={T(label)}
      triggerIcon={<HandCoins />}
      title={T("Record a payment")}
      description={T("For money received outside ERA (bank transfer, cash…). It is saved as pending and counts only after someone verifies and approves it.")}
      submitLabel={T("Record as pending")}
      onOpen={() => setKey(newIdempotencyKey())}
      onSubmit={submit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`pay-amount-${enrollmentId}`} label={T("Amount (₩)")} required>
          <Input id={`pay-amount-${enrollmentId}`} name="amount" inputMode="numeric" placeholder="100000" required />
        </Field>
        <Field id={`pay-kind-${enrollmentId}`} label={T("Type")}>
          <Select id={`pay-kind-${enrollmentId}`} name="kind" defaultValue="PAYMENT">
            <option value="PAYMENT">{T("Payment received")}</option>
            <option value="REFUND">{T("Refund given back")}</option>
          </Select>
        </Field>
        <Field id={`pay-method-${enrollmentId}`} label={T("Method")}>
          <Select id={`pay-method-${enrollmentId}`} name="method" defaultValue="BANK_TRANSFER">
            <option value="BANK_TRANSFER">{T("Bank transfer")}</option>
            <option value="CASH">{T("Cash")}</option>
            <option value="ONLINE">{T("Online")}</option>
            <option value="OTHER">{T("Other")}</option>
          </Select>
        </Field>
        <Field id={`pay-date-${enrollmentId}`} label={T("Payment date")}>
          <Input id={`pay-date-${enrollmentId}`} name="transactionDate" type="date" defaultValue={today} />
        </Field>
        <Field id={`pay-ref-${enrollmentId}`} label={T("Reference (optional)")} hint={T("e.g. bank transfer number")}>
          <Input id={`pay-ref-${enrollmentId}`} name="reference" maxLength={120} />
        </Field>
        <Field id={`pay-note-${enrollmentId}`} label={T("Note (optional)")}>
          <Input id={`pay-note-${enrollmentId}`} name="description" maxLength={500} />
        </Field>
      </div>
    </FormDialog>
  );
}

export function PaymentReviewActions({
  transactionId,
  workspace,
  status,
  amount,
  canApprove,
  canCorrect
}: {
  transactionId: string;
  workspace: Workspace;
  status: string;
  amount: number;
  canApprove: boolean;
  canCorrect: boolean;
}) {
  const T = useT();
  const { run, pending } = useManagementMutation();
  const [key, setKey] = React.useState(newIdempotencyKey);
  const url = `/api/management/payments/${transactionId}`;

  return (
    <div className="flex flex-wrap gap-2">
      {status === "PENDING" && canApprove ? (
        <>
          <ConfirmDialog
            trigger={
              <Button size="sm" disabled={pending}>
                <BadgeCheck />
                {T("Approve")}
              </Button>
            }
            title={T("Approve this payment?")}
            description={T("Approve ₩{amount} only if you have checked that the money was actually received. It will then count toward the balance.", { amount: amount.toLocaleString("en-US") })}
            confirmLabel={T("Approve payment")}
            cancelLabel={T("Cancel")}
            onConfirm={async () => {
              await run(url, "POST", { workspace, decision: "approve" }, T("Payment approved."));
            }}
          />
          <FormDialog
            triggerLabel={T("Reject")}
            triggerIcon={<Ban />}
            title={T("Reject this payment")}
            description={T("The payment stays in the history as rejected and never counts.")}
            submitLabel={T("Reject payment")}
            destructive
            onSubmit={async (form) => Boolean(await run(url, "POST", { workspace, decision: "reject", reason: formString(form, "reason") }, T("Payment rejected.")))}
          >
            <Field id={`reject-reason-${transactionId}`} label={T("Reason")} required>
              <Input id={`reject-reason-${transactionId}`} name="reason" required maxLength={500} placeholder={T("e.g. Transfer not found in the bank account")} />
            </Field>
          </FormDialog>
        </>
      ) : null}
      {status === "APPROVED" && canApprove ? (
        <FormDialog
          triggerLabel={T("Reverse")}
          triggerIcon={<Undo2 />}
          title={T("Reverse this payment")}
          description={T("Use this if an approved payment turned out to be wrong. It stays in the history as reversed and stops counting.")}
          submitLabel={T("Reverse payment")}
          destructive
          onSubmit={async (form) => Boolean(await run(url, "POST", { workspace, decision: "reverse", reason: formString(form, "reason") }, T("Payment reversed.")))}
        >
          <Field id={`reverse-reason-${transactionId}`} label={T("Reason")} required>
            <Input id={`reverse-reason-${transactionId}`} name="reason" required maxLength={500} />
          </Field>
        </FormDialog>
      ) : null}
      {(status === "PENDING" || status === "APPROVED") && canCorrect ? (
        <FormDialog
          triggerLabel={T("Correct")}
          triggerIcon={<PencilLine />}
          title={T("Correct the amount")}
          description={T("The original record is kept (reversed or rejected) and a new pending record with the right amount is linked to it.")}
          submitLabel={T("Record correction")}
          onOpen={() => setKey(newIdempotencyKey())}
          onSubmit={async (form) => {
            const corrected = formAmount(form, "amount");
            if (!corrected || Number.isNaN(corrected)) {
              toast({ title: T("Enter the correct amount in whole won."), variant: "error" });
              return false;
            }
            return Boolean(
              await run(url, "POST", { workspace, decision: "correct", amount: corrected, reason: formString(form, "reason"), idempotencyKey: key }, T("Correction recorded as pending."))
            );
          }}
        >
          <Field id={`correct-amount-${transactionId}`} label={T("Correct amount (₩)")} hint={T("Currently ₩{amount}", { amount: amount.toLocaleString("en-US") })} required>
            <Input id={`correct-amount-${transactionId}`} name="amount" inputMode="numeric" required />
          </Field>
          <Field id={`correct-reason-${transactionId}`} label={T("Reason")} required>
            <Input id={`correct-reason-${transactionId}`} name="reason" required maxLength={500} />
          </Field>
        </FormDialog>
      ) : null}
    </div>
  );
}

/**
 * One step for the usual case "the student paid me": records the payment and, when the teacher may approve,
 * approves it right away so it counts. Without approval permission it stays pending for an administrator.
 */
export function MarkPaidButton({
  enrollmentId,
  workspace,
  today,
  remaining,
  canApprove,
  currency = "KRW"
}: {
  enrollmentId: string;
  workspace: Workspace;
  today: string;
  remaining: number;
  canApprove: boolean;
  currency?: string;
}) {
  const T = useT();
  const { run } = useManagementMutation();
  const [key, setKey] = React.useState(newIdempotencyKey);

  async function submit(form: FormData) {
    const amount = formAmount(form, "amount");
    if (!amount || Number.isNaN(amount)) {
      toast({ title: T("Enter the amount as a whole number of won, e.g. 100000."), variant: "error" });
      return false;
    }
    const body = {
      workspace,
      enrollmentId,
      kind: "PAYMENT",
      amount,
      currency,
      method: formString(form, "method") || "OTHER",
      transactionDate: formString(form, "transactionDate") || today,
      reference: null,
      description: null,
      idempotencyKey: key
    };
    if (!canApprove) {
      const result = await run("/api/management/payments", "POST", body, "Payment recorded. It is pending until approved.");
      if (result) setKey(newIdempotencyKey());
      return Boolean(result);
    }
    let transactionId: string | undefined;
    try {
      const response = await fetch("/api/management/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; transaction?: { id?: string } } | null;
      if (!response.ok || !payload?.ok || !payload.transaction?.id) {
        toast({ title: payload?.error ?? T("That didn't work. Please try again."), variant: "error" });
        return false;
      }
      transactionId = payload.transaction.id;
    } catch {
      toast({ title: T("You seem to be offline. Nothing was saved."), variant: "error" });
      return false;
    }
    setKey(newIdempotencyKey());
    const approved = await run(`/api/management/payments/${transactionId}`, "POST", { workspace, decision: "approve" }, "Payment confirmed. It now counts as paid.");
    // Close either way: the payment is recorded; if approval failed it simply stays pending in the history.
    if (!approved) window.location.reload();
    return true;
  }

  return (
    <FormDialog
      triggerLabel={T("Confirm payment")}
      triggerVariant="default"
      triggerIcon={<BadgeCheck />}
      title={T("The student paid")}
      description={
        canApprove
          ? T("Only confirm money you actually received. It counts as paid right away and is kept in the payment history.")
          : T("It is saved and counts after an administrator approves it.")
      }
      submitLabel={T("Confirm payment")}
      onOpen={() => setKey(newIdempotencyKey())}
      onSubmit={submit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`paid-amount-${enrollmentId}`} label={T("Amount (₩)")} required>
          <Input id={`paid-amount-${enrollmentId}`} name="amount" inputMode="numeric" defaultValue={String(remaining)} required />
        </Field>
        <Field id={`paid-method-${enrollmentId}`} label={T("Method")}>
          <Select id={`paid-method-${enrollmentId}`} name="method" defaultValue="BANK_TRANSFER">
            <option value="BANK_TRANSFER">{T("Bank transfer")}</option>
            <option value="CASH">{T("Cash")}</option>
            <option value="ONLINE">{T("Online")}</option>
            <option value="OTHER">{T("Other")}</option>
          </Select>
        </Field>
        <Field id={`paid-date-${enrollmentId}`} label={T("Payment date")}>
          <Input id={`paid-date-${enrollmentId}`} name="transactionDate" type="date" defaultValue={today} />
        </Field>
      </div>
    </FormDialog>
  );
}
