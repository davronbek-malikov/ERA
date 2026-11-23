"use client";

import * as React from "react";
import { CircleAlert, KeyRound, LogOut, MessageSquareCode, ShieldCheck, Smartphone, Undo2 } from "lucide-react";

import { useT } from "@/components/i18n/locale-provider";
import { useManagementMutation } from "@/components/management/use-mutation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";

/*
 * ERA Assistant → Messages: connect the teacher's own Telegram number (src/server/telegram/account.ts).
 * The step shown follows the server state: phone → code → (two-step password) → connected.
 */

export type AccountStatus = {
  configured: boolean;
  status: "NONE" | "CODE_SENT" | "PASSWORD_NEEDED" | "CONNECTED" | "DISCONNECTED";
  phone?: string;
  name?: string | null;
  username?: string | null;
  limitedUntil?: string | null;
  lastError?: string | null;
};

const URL = "/api/management/telegram/account";

export function TelegramAccountCard({ account }: { account: AccountStatus }) {
  const T = useT();
  const { run, pending } = useManagementMutation();
  const [phone, setPhone] = React.useState("+");
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const startOver = () => run(`${URL}?workspace=teacher`, "DELETE", null, "Cancelled.");

  if (!account.configured) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {T("Sending from your own number isn't set up yet: the administrator must add TELEGRAM_API_ID and TELEGRAM_API_HASH.")}
      </p>
    );
  }

  if (account.status === "CONNECTED") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-success/10 text-success">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <span className="flex flex-col text-sm">
              <span className="font-semibold">
                {account.name}
                {account.username ? <span className="font-normal text-muted-foreground"> · @{account.username}</span> : null}
              </span>
              <span className="text-muted-foreground">{account.phone}</span>
            </span>
            <Badge variant="success">{T("Connected")}</Badge>
          </div>
          <ConfirmDialog
            trigger={
              <Button size="sm" variant="outline" disabled={pending}>
                <LogOut />
                {T("Disconnect")}
              </Button>
            }
            title={T("Disconnect your Telegram number?")}
            description={T("ERA logs out of your Telegram and forgets the login. Messages then go through the ERA bot.")}
            confirmLabel={T("Disconnect")}
            cancelLabel={T("Cancel")}
            destructive
            onConfirm={async () => {
              await run(`${URL}?workspace=teacher`, "DELETE", null, "Disconnected.");
            }}
          />
        </div>
        {account.limitedUntil ? (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs">
            {T("Telegram asked to slow down. Sending from your number pauses until {time}; nothing is lost.", { time: new Date(account.limitedUntil).toLocaleString() })}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">{T("Safety: one message at a time with random gaps, only to your own students, never at night. You can also end this login in Telegram → Settings → Devices.")}</p>
      </div>
    );
  }

  if (account.status === "CODE_SENT") {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await run(URL, "POST", { workspace: "teacher", step: "code", code }, "Checked.")) setCode("");
        }}
      >
        <label htmlFor="tg-code" className="flex items-center gap-2 text-sm font-medium">
          <MessageSquareCode className="size-4 text-primary" aria-hidden="true" />
          {T("Enter the code Telegram sent to your Telegram app ({phone})", { phone: account.phone ?? "" })}
        </label>
        <div className="flex flex-wrap gap-2">
          <Input id="tg-code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="12345" className="w-36 text-center text-lg tracking-widest" required />
          <Button type="submit" disabled={pending}>
            {T("Confirm")}
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={startOver}>
            <Undo2 />
            {T("Start over")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{T("Never send this code to anyone in a chat; enter it only here.")}</p>
      </form>
    );
  }

  if (account.status === "PASSWORD_NEEDED") {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          await run(URL, "POST", { workspace: "teacher", step: "password", password }, "Checked.");
          setPassword("");
        }}
      >
        <label htmlFor="tg-password" className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="size-4 text-primary" aria-hidden="true" />
          {T("Your Telegram has two-step verification: enter that password")}
        </label>
        <div className="flex flex-wrap gap-2">
          <Input id="tg-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="w-56" required />
          <Button type="submit" disabled={pending}>
            {T("Confirm")}
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={startOver}>
            <Undo2 />
            {T("Start over")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{T("The password is only used once to log in and is never saved.")}</p>
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        await run(URL, "POST", { workspace: "teacher", step: "phone", phone }, "Telegram sent you a code.");
      }}
    >
      {account.status === "DISCONNECTED" ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs">{T("Your Telegram login ended (for example it was removed in Settings → Devices). Connect again to send from your number.")}</p>
      ) : null}
      <label htmlFor="tg-phone" className="flex items-center gap-2 text-sm font-medium">
        <Smartphone className="size-4 text-primary" aria-hidden="true" />
        {T("Your Telegram phone number")}
      </label>
      <div className="flex flex-wrap gap-2">
        <Input id="tg-phone" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="+998901234567" className="w-56" required />
        <Button type="submit" disabled={pending}>
          {T("Get code")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{T("Telegram sends a login code to your Telegram app. Messages to students will then come from your own number.")}</p>
    </form>
  );
}
