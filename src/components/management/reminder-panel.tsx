import { CalendarClock, CheckCircle2, CircleAlert, Link2, Send, TriangleAlert } from "lucide-react";

import { CopyInviteButton, ReminderSettingsForm, SendRemindersNowButton } from "@/components/management/reminder-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getT } from "@/lib/i18n-server";
import { telegramUrl } from "@/lib/student-contact";
import type { ManagementActor } from "@/server/management/actor";
import { DEFAULT_REMINDER_TEXT, REMINDER_TIME_LABEL, getReminderOverview, getReminderSettings } from "@/server/management/reminders";

/** Assistant → Automatic messages: Saturday Telegram reminders for students behind the weekly homework rule. */
export async function ReminderPanel({ actor }: { actor: ManagementActor }) {
  const T = await getT();
  const [settings, overview] = await Promise.all([getReminderSettings(actor), getReminderOverview(actor)]);
  const connected = overview.students.filter((student) => student.linked).length;
  const behindLinked = overview.behind.filter((row) => row.student.linked && row.reminder?.status !== "SENT").length;
  const setupMissing = !settings.botConfigured || !settings.webhookConfigured || !settings.cronConfigured;

  return (
    <div className="flex flex-col gap-4">
      {setupMissing ? (
        <div role="alert" className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning-foreground" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-semibold">{T("The Telegram bot isn't fully connected yet")}</p>
            <p className="text-muted-foreground">{T("Until the administrator finishes the setup, nothing is sent. Missing:")}</p>
            <ul className="list-disc ps-5 text-muted-foreground">
              {!settings.botConfigured ? <li>TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME</li> : null}
              {!settings.webhookConfigured ? <li>TELEGRAM_WEBHOOK_SECRET</li> : null}
              {!settings.cronConfigured ? <li>CRON_SECRET</li> : null}
            </ul>
          </div>
        </div>
      ) : null}
      {!settings.ruleEnabled ? (
        <div role="alert" className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning-foreground" aria-hidden="true" />
          <p>{T("Your weekly homework rule is off, so no student is behind and nothing is sent. Turn it on in My students → Weekly rule.")}</p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-5 text-primary" aria-hidden="true" />
              {T("Automatic message sender")}
            </CardTitle>
            <CardDescription>
              {T("Every Saturday at {time} (Seoul time). Rule: at least {count} homeworks every 7 days.", { time: REMINDER_TIME_LABEL, count: settings.perWeek })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReminderSettingsForm enabled={settings.enabled} text={settings.text} defaultText={DEFAULT_REMINDER_TEXT} disabled={!settings.editable} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TriangleAlert className="size-5 text-error" aria-hidden="true" />
              {T("Behind this week ({count})", { count: overview.behind.length })}
            </CardTitle>
            <CardDescription>{T("These students get the message on Saturday.")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {overview.behind.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {T("Nobody is behind. Nothing to send.")}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {overview.behind.map((row) => (
                  <li key={row.enrollmentId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{row.student.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {row.course} ·{" "}
                        {T("Week {week}: {count}/{required} homework", {
                          week: row.pace.lastWeek?.number ?? 0,
                          count: row.pace.lastWeek?.count ?? 0,
                          required: row.pace.lastWeek?.required ?? 0
                        })}
                      </span>
                    </span>
                    {row.reminder?.status === "SENT" ? (
                      <Badge variant="success">
                        <Send className="size-3" aria-hidden="true" />
                        {T("Sent")}
                      </Badge>
                    ) : row.reminder?.status === "FAILED" ? (
                      <Badge variant="error" title={row.reminder.error ?? undefined}>
                        {T("Failed, will retry")}
                      </Badge>
                    ) : row.student.linked ? (
                      <Badge variant="warning">{T("Waiting for Saturday")}</Badge>
                    ) : (
                      <Badge variant="neutral">{T("Not connected to Telegram")}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div>
              <SendRemindersNowButton count={behindLinked} disabled={!settings.botConfigured || behindLinked === 0} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="size-5 text-primary" aria-hidden="true" />
            {T("Telegram connection ({connected}/{total})", { connected, total: overview.students.length })}
          </CardTitle>
          <CardDescription>
            {T("A Telegram bot can only write to students who pressed Start once. Send each student their personal link; after they press Start they show as connected.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {overview.students.length === 0 ? (
            <p className="text-sm text-muted-foreground">{T("No active students yet.")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {overview.students.map((student) => {
                const chat = telegramUrl(student.telegram);
                return (
                  <li key={student.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{student.name}</span>
                      {student.telegram ? (
                        chat ? (
                          <a href={chat} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                            {student.telegram}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">{student.telegram}</span>
                        )
                      ) : null}
                    </span>
                    {student.linked ? (
                      <Badge variant="success">
                        <CheckCircle2 className="size-3" aria-hidden="true" />
                        {T("Connected")}
                      </Badge>
                    ) : student.inviteUrl ? (
                      <CopyInviteButton url={student.inviteUrl} />
                    ) : (
                      <Badge variant="neutral">{T("Not connected to Telegram")}</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {overview.history.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{T("Recently sent")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border text-sm">
              {overview.history.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{row.student.name}</span>
                    <span className="text-muted-foreground"> · {T("Week {week}: {count}/{required} homework", { week: row.week, count: row.handedIn, required: row.required })}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {row.at.slice(0, 10)} · {row.source === "AUTO" ? T("Automatic") : T("Manual")}
                    <Badge variant={row.status === "SENT" ? "success" : row.status === "FAILED" ? "error" : "neutral"} title={row.error ?? undefined}>
                      {row.status === "SENT" ? T("Sent") : row.status === "FAILED" ? T("Failed") : T("Sending")}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
