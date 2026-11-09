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
  const { run } = useManagementMutation();
  const [key, setKey] = React.useState(newIdempotencyKey);

  async function submit(form: FormData) {
    const amount = formAmount(form, "amount");
    if (!amount || Number.isNaN(amount)) {
      toast({ title: "Enter the amount as a whole number of won, e.g. 100000.", variant: "error" });
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
      triggerLabel={label}
      triggerIcon={<HandCoins />}
      title="Record a payment"
      description="For money received outside ERA (bank transfer, cash…). It is saved as pending and counts only after someone verifies and approves it."
      submitLabel="Record as pending"
      onOpen={() => setKey(newIdempotencyKey())}
      onSubmit={submit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`pay-amount-${enrollmentId}`} label="Amount (₩)" required>
          <Input id={`pay-amount-${enrollmentId}`} name="amount" inputMode="numeric" placeholder="100000" required />
        </Field>
        <Field id={`pay-kind-${enrollmentId}`} label="Type">
          <Select id={`pay-kind-${enrollmentId}`} name="kind" defaultValue="PAYMENT">
            <option value="PAYMENT">Payment received</option>
            <option value="REFUND">Refund given back</option>
          </Select>
        </Field>
        <Field id={`pay-method-${enrollmentId}`} label="Method">
          <Select id={`pay-method-${enrollmentId}`} name="method" defaultValue="BANK_TRANSFER">
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CASH">Cash</option>
            <option value="ONLINE">Online</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field id={`pay-date-${enrollmentId}`} label="Payment date">
          <Input id={`pay-date-${enrollmentId}`} name="transactionDate" type="date" defaultValue={today} />
        </Field>
        <Field id={`pay-ref-${enrollmentId}`} label="Reference (optional)" hint="e.g. bank transfer number">
          <Input id={`pay-ref-${enrollmentId}`} name="reference" maxLength={120} />
        </Field>
        <Field id={`pay-note-${enrollmentId}`} label="Note (optional)">
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
                Approve
              </Button>
            }
            title="Approve this payment?"
            description={`Approve ${amount.toLocaleString("en-US")} only if you have verified the money was actually received. It will then count toward the balance.`}
            confirmLabel="Approve payment"
            onConfirm={async () => {
              await run(url, "POST", { workspace, decision: "approve" }, "Payment approved.");
            }}
          />
          <FormDialog
            triggerLabel="Reject"
            triggerIcon={<Ban />}
            title="Reject this payment"
            description="The payment stays in the history as rejected and never counts."
            submitLabel="Reject payment"
            destructive
            onSubmit={async (form) => Boolean(await run(url, "POST", { workspace, decision: "reject", reason: formString(form, "reason") }, "Payment rejected."))}
          >
            <Field id={`reject-reason-${transactionId}`} label="Reason" required>
              <Input id={`reject-reason-${transactionId}`} name="reason" required maxLength={500} placeholder="e.g. Transfer not found in the bank account" />
            </Field>
          </FormDialog>
        </>
      ) : null}
      {status === "APPROVED" && canApprove ? (
        <FormDialog
          triggerLabel="Reverse"
          triggerIcon={<Undo2 />}
          title="Reverse this payment"
          description="Use this if an approved payment turned out to be wrong. It stays in the history as reversed and stops counting."
          submitLabel="Reverse payment"
          destructive
          onSubmit={async (form) => Boolean(await run(url, "POST", { workspace, decision: "reverse", reason: formString(form, "reason") }, "Payment reversed."))}
        >
          <Field id={`reverse-reason-${transactionId}`} label="Reason" required>
            <Input id={`reverse-reason-${transactionId}`} name="reason" required maxLength={500} />
          </Field>
        </FormDialog>
      ) : null}
      {(status === "PENDING" || status === "APPROVED") && canCorrect ? (
        <FormDialog
          triggerLabel="Correct"
          triggerIcon={<PencilLine />}
          title="Correct the amount"
          description="The original record is kept (reversed or rejected) and a new pending record with the right amount is linked to it."
          submitLabel="Record correction"
          onOpen={() => setKey(newIdempotencyKey())}
          onSubmit={async (form) => {
            const corrected = formAmount(form, "amount");
            if (!corrected || Number.isNaN(corrected)) {
              toast({ title: "Enter the correct amount in whole won.", variant: "error" });
              return false;
            }
            return Boolean(
              await run(url, "POST", { workspace, decision: "correct", amount: corrected, reason: formString(form, "reason"), idempotencyKey: key }, "Correction recorded as pending.")
            );
          }}
        >
          <Field id={`correct-amount-${transactionId}`} label="Correct amount (₩)" hint={`Currently ${amount.toLocaleString("en-US")}`} required>
            <Input id={`correct-amount-${transactionId}`} name="amount" inputMode="numeric" required />
          </Field>
          <Field id={`correct-reason-${transactionId}`} label="Reason" required>
            <Input id={`correct-reason-${transactionId}`} name="reason" required maxLength={500} />
          </Field>
        </FormDialog>
      ) : null}
    </div>
  );
}
