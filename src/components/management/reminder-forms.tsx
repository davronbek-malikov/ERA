"use client";

import * as React from "react";
import { Check, Copy, Save, Send } from "lucide-react";

import { useT } from "@/components/i18n/locale-provider";
import { useManagementMutation } from "@/components/management/use-mutation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

/* Assistant → Automatic messages: the teacher's Saturday Telegram reminder (src/server/management/reminders.ts). */

export function ReminderSettingsForm({ enabled, text, defaultText, disabled }: { enabled: boolean; text: string; defaultText: string; disabled?: boolean }) {
  const T = useT();
  const { run, pending } = useManagementMutation();
  const [on, setOn] = React.useState(enabled);
  const [message, setMessage] = React.useState(text);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await run("/api/management/homework/reminders", "PUT", { workspace: "teacher", enabled: on, text: message }, "Automatic message saved.");
      }}
    >
      <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
        <input type="checkbox" checked={on} onChange={(event) => setOn(event.target.checked)} disabled={disabled} className="mt-0.5 size-4" />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{T("Send automatically every Saturday")}</span>
          <span className="text-muted-foreground">{T("Students who handed in fewer homeworks than the weekly rule get this message on Telegram, once per week.")}</span>
        </span>
      </label>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="reminder-text" className="text-sm font-medium">
          {T("Message")}
        </label>
        <Textarea id="reminder-text" value={message} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={1500} required disabled={disabled} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{T("Tip: {name} is replaced by the student's name.")}</span>
          {message !== defaultText ? (
            <button type="button" className="underline hover:text-foreground" onClick={() => setMessage(defaultText)}>
              {T("Restore the default text")}
            </button>
          ) : null}
        </div>
      </div>
      <div>
        <Button type="submit" disabled={pending || disabled}>
          <Save />
          {T("Save")}
        </Button>
      </div>
    </form>
  );
}

export function SendRemindersNowButton({ count, disabled }: { count: number; disabled?: boolean }) {
  const T = useT();
  const { run, pending } = useManagementMutation();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" disabled={pending || disabled}>
          <Send />
          {T("Send now")}
        </Button>
      }
      title={T("Send the reminder now?")}
      description={T("{count} students who are behind and connected to Telegram get the message now. Anyone who already got it for that week is skipped.", { count })}
      confirmLabel={T("Send now")}
      cancelLabel={T("Cancel")}
      onConfirm={async () => {
        const result = (await run("/api/management/homework/reminders/send", "POST", { workspace: "teacher" }, "Reminders processed.")) as {
          summary?: { sent: number; failed: number; notLinked: number; alreadySent: number };
        } | null;
        if (result?.summary) {
          const s = result.summary;
          toast({
            title: T("Sent: {sent} · Failed: {failed} · Not connected: {notLinked} · Already sent: {alreadySent}", s),
            variant: s.failed ? "error" : "success"
          });
        }
      }}
    />
  );
}

export function CopyInviteButton({ url }: { url: string }) {
  const T = useT();
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast({ title: url, variant: "info" });
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? T("Copied") : T("Copy invite link")}
    </Button>
  );
}
