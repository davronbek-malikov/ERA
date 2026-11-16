import { CalendarClock, CheckCircle2, CircleAlert, History, Link2, PenLine, Repeat } from "lucide-react";

import { CopyInviteButton, MessageComposer, MessagePlanActions, WEEKDAYS } from "@/components/management/message-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getT } from "@/lib/i18n-server";
import { telegramUrl } from "@/lib/student-contact";
import type { ManagementActor } from "@/server/management/actor";
import { todayInPlatform } from "@/server/management/time";
import { DEFAULT_HOMEWORK_TEXT, getMessagesOverview } from "@/server/telegram/messages";

/** ERA Assistant → Messages: Telegram messages from the teacher to their students. */
export async function MessagesPanel({ actor }: { actor: ManagementActor }) {
  const T = await getT();
  const data = await getMessagesOverview(actor);
  const connected = data.students.filter((student) => student.linked).length;
  const setupMissing = !data.setup.botConfigured || !data.setup.webhookConfigured || !data.setup.cronConfigured;
  const audienceLabel = (plan: (typeof data.plans)[number]) =>
    plan.audience === "ALL"
      ? T("All students")
      : plan.audience === "BEHIND"
        ? T("Behind the weekly rule")
        : plan.selectedNames.length <= 3
          ? plan.selectedNames.join(", ")
          : T("{names} and {count} more", { names: plan.selectedNames.slice(0, 3).join(", "), count: plan.selectedNames.length - 3 });

  return (
    <div className="flex flex-col gap-4">
      {setupMissing ? (
        <div role="alert" className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning-foreground" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-semibold">{T("The Telegram bot isn't fully connected yet")}</p>
            <p className="text-muted-foreground">{T("You can already prepare and schedule messages; they are sent once the setup is finished. Missing:")}</p>
            <ul className="list-disc ps-5 text-muted-foreground">
              {!data.setup.botConfigured ? <li>TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME</li> : null}
              {!data.setup.webhookConfigured ? <li>TELEGRAM_WEBHOOK_SECRET</li> : null}
              {!data.setup.cronConfigured ? <li>CRON_SECRET</li> : null}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PenLine className="size-5 text-primary" aria-hidden="true" />
              {T("New message")}
            </CardTitle>
            <CardDescription>{T("Choose what to write, who gets it and when. Messages go to students' Telegram.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <MessageComposer
              students={data.students.map((student) => ({ id: student.id, name: student.name, linked: student.linked, behind: student.behind }))}
              today={todayInPlatform()}
              defaultText={DEFAULT_HOMEWORK_TEXT}
              perWeek={data.perWeek}
              ruleEnabled={data.ruleEnabled}
              disabled={!data.editable}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-5 text-primary" aria-hidden="true" />
                {T("Scheduled messages")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.plans.length === 0 ? (
                <p className="text-sm text-muted-foreground">{T("Nothing scheduled yet.")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {data.plans.map((plan) => {
                    const finished = plan.schedule === "ONCE" && !plan.active && Boolean(plan.lastRunAt);
                    return (
                      <li key={plan.id} className="flex flex-col gap-2 py-3 text-sm">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {plan.schedule === "WEEKLY" ? (
                            <Badge variant="primary">
                              <Repeat className="size-3" aria-hidden="true" />
                              {T("Every {day} at {time}", { day: T(WEEKDAYS[plan.weekday ?? 6]), time: plan.timeOfDay ?? "" })}
                            </Badge>
                          ) : (
                            <Badge variant="primary">
                              <CalendarClock className="size-3" aria-hidden="true" />
                              {plan.sendAt ? `${plan.sendAt.date} ${plan.sendAt.time}` : ""}
                            </Badge>
                          )}
                          {finished ? (
                            <Badge variant="success">{T("Sent ({count})", { count: plan.sentCount })}</Badge>
                          ) : plan.active ? (
                            <Badge variant="warning">{plan.nextRunAt ? T("Next: {date} {time}", plan.nextRunAt) : T("Waiting")}</Badge>
                          ) : (
                            <Badge variant="neutral">{T("Paused")}</Badge>
                          )}
                          <Badge variant="outline">{audienceLabel(plan)}</Badge>
                        </div>
                        <p className="line-clamp-2 text-muted-foreground">{plan.text}</p>
                        <MessagePlanActions id={plan.id} active={plan.active} canResume={plan.schedule === "WEEKLY"} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-5 text-primary" aria-hidden="true" />
                {T("Recently sent")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">{T("No messages yet.")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border text-sm">
                  {data.history.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium">{row.student.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{row.preview}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        {row.at.date} {row.at.time}
                        <Badge
                          variant={row.status === "SENT" ? "success" : row.status === "FAILED" ? "error" : "neutral"}
                          title={row.error ?? undefined}
                        >
                          {row.status === "SENT" ? T("Sent") : row.status === "FAILED" ? T("Failed") : row.status === "NOT_CONNECTED" ? T("Not connected") : T("Sending")}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="size-5 text-primary" aria-hidden="true" />
            {T("Telegram connection ({connected}/{total})", { connected, total: data.students.length })}
          </CardTitle>
          <CardDescription>
            {T("A Telegram bot can only write to students who pressed Start once. Send each student their personal link; after they press Start they show as connected.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.students.length === 0 ? (
            <p className="text-sm text-muted-foreground">{T("No active students yet.")}</p>
          ) : (
            <ul className="grid gap-x-6 divide-y divide-border md:grid-cols-2 md:divide-y-0">
              {data.students.map((student) => {
                const chat = telegramUrl(student.telegram);
                return (
                  <li key={student.id} className="flex flex-wrap items-center justify-between gap-2 border-border py-2 text-sm md:border-b">
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
                      <Badge variant="neutral">{T("Not connected")}</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
