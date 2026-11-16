"use client";

import * as React from "react";
import { CalendarClock, Check, Copy, Pause, Play, Repeat, Search, Send, Trash2, Wand2, Zap } from "lucide-react";

import { useT } from "@/components/i18n/locale-provider";
import { useManagementMutation } from "@/components/management/use-mutation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { CalendarPicker, ScheduleSummary, TimePicker, WEEKDAYS, WeekdayPicker, useDateLabel } from "@/components/management/schedule-pickers";

/* ERA Assistant → Messages: compose a Telegram message (who / what / when). Server: src/server/telegram/messages.ts */

export { WEEKDAYS } from "@/components/management/schedule-pickers";

type Student = { id: string; name: string; linked: boolean; behind: { week: number; count: number; required: number } | null };
type Audience = "ALL" | "BEHIND" | "SELECTED";
type When = "NOW" | "ONCE" | "WEEKLY";

function Choice<T extends string>({ value, current, onChange, icon, label, hint }: { value: T; current: T; onChange: (value: T) => void; icon: React.ReactNode; label: string; hint?: string }) {
  const active = value === current;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={() => onChange(value)}
      className={cn(
        "flex min-w-0 flex-1 items-start gap-2 rounded-xl border p-3 text-start text-sm transition-colors [&_svg]:size-4 [&_svg]:shrink-0",
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted"
      )}
    >
      <span className={cn("mt-0.5", active ? "text-primary" : "text-muted-foreground")}>{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="font-medium">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </button>
  );
}

export function MessageComposer({ students, today, nowTime, defaultText, perWeek, ruleEnabled, disabled }: { students: Student[]; today: string; nowTime: string; defaultText: string; perWeek: number; ruleEnabled: boolean; disabled?: boolean }) {
  const T = useT();
  const { run, pending } = useManagementMutation();
  const [text, setText] = React.useState("");
  const [audience, setAudience] = React.useState<Audience>("ALL");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [query, setQuery] = React.useState("");
  const [when, setWhen] = React.useState<When>("NOW");
  // Default to the next 10:00 that is still ahead (today, or tomorrow once 10:00 has passed).
  const [date, setDate] = React.useState(() => (nowTime < "09:55" ? today : new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)));
  const [time, setTime] = React.useState("10:00");
  const [weekday, setWeekday] = React.useState(6);
  const dateLabel = useDateLabel();

  const behindCount = students.filter((student) => student.behind).length;
  const recipients = audience === "ALL" ? students.length : audience === "BEHIND" ? behindCount : selected.size;
  const visible = students.filter((student) => student.name.toLowerCase().includes(query.trim().toLowerCase()));
  const allVisibleSelected = visible.length > 0 && visible.every((student) => selected.has(student.id));

  function applyHomeworkTemplate() {
    setText(defaultText);
    setAudience("BEHIND");
    setWhen("WEEKLY");
    setWeekday(6);
    setTime("10:00");
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) {
      toast({ title: T("Write the message."), variant: "error" });
      return;
    }
    if (audience === "SELECTED" && selected.size === 0) {
      toast({ title: T("Choose at least one student."), variant: "error" });
      return;
    }
    if (when === "ONCE" && date === today && time <= nowTime) {
      toast({ title: T("This time has already passed today. Choose a later time."), variant: "error" });
      return;
    }
    const body = { workspace: "teacher", text, audience, studentIds: [...selected], when, date, time, weekday };
    const result = (await run("/api/management/telegram/messages", "POST", body, when === "NOW" ? "Message processed." : "Message scheduled.")) as {
      summary?: { sent: number; failed: number; notConnected: number } | null;
    } | null;
    if (!result) return;
    if (result.summary) {
      toast({ title: T("Sent: {sent} · Failed: {failed} · Not connected: {notConnected}", result.summary), variant: result.summary.failed ? "error" : "success" });
    }
    setText("");
    setSelected(new Set());
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {/* WHAT */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">1. {T("Message")}</h3>
          <button type="button" onClick={applyHomeworkTemplate} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <Wand2 className="size-3.5" aria-hidden="true" />
            {T("Template: weekly homework reminder")}
          </button>
        </div>
        <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={5} maxLength={2000} placeholder={T("Write your message…")} disabled={disabled} aria-label={T("Message")} />
        <p className="text-xs text-muted-foreground">{T("Tip: {name} is replaced by the student's name.")}</p>
      </section>

      {/* WHO */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">2. {T("Who gets it")}</h3>
        <div role="radiogroup" className="flex flex-col gap-2 sm:flex-row">
          <Choice value="ALL" current={audience} onChange={setAudience} icon={<Send />} label={T("All students")} hint={T("{count} students", { count: students.length })} />
          <Choice
            value="BEHIND"
            current={audience}
            onChange={setAudience}
            icon={<Zap />}
            label={T("Behind the weekly rule")}
            hint={ruleEnabled ? T("Fewer than {count} homeworks last week · now {behind}", { count: perWeek, behind: behindCount }) : T("The weekly rule is off")}
          />
          <Choice value="SELECTED" current={audience} onChange={setAudience} icon={<Check />} label={T("Choose students")} hint={T("{count} selected", { count: selected.size })} />
        </div>
        {audience === "SELECTED" ? (
          <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={T("Search students")} className="ps-8" aria-label={T("Search students")} />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setSelected((current) => {
                    const next = new Set(current);
                    for (const student of visible) {
                      if (allVisibleSelected) next.delete(student.id);
                      else next.add(student.id);
                    }
                    return next;
                  })
                }
              >
                {allVisibleSelected ? T("Clear") : T("Select all")}
              </Button>
            </div>
            <ul className="flex max-h-64 flex-col overflow-y-auto">
              {visible.map((student) => (
                <li key={student.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                    <input type="checkbox" className="size-4" checked={selected.has(student.id)} onChange={() => toggle(student.id)} />
                    <span className="flex-1 truncate">{student.name}</span>
                    {student.behind ? (
                      <Badge variant="error">
                        {student.behind.count}/{student.behind.required}
                      </Badge>
                    ) : null}
                    {student.linked ? <Badge variant="success">{T("Connected")}</Badge> : <Badge variant="neutral">{T("Not connected")}</Badge>}
                  </label>
                </li>
              ))}
              {visible.length === 0 ? <li className="px-2 py-1.5 text-sm text-muted-foreground">{T("No students found.")}</li> : null}
            </ul>
          </div>
        ) : null}
      </section>

      {/* WHEN */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">3. {T("When")}</h3>
        <div role="radiogroup" className="flex flex-col gap-2 sm:flex-row">
          <Choice value="NOW" current={when} onChange={setWhen} icon={<Send />} label={T("Now")} />
          <Choice value="ONCE" current={when} onChange={setWhen} icon={<CalendarClock />} label={T("At an exact time")} />
          <Choice value="WEEKLY" current={when} onChange={setWhen} icon={<Repeat />} label={T("Every week")} />
        </div>
        {when === "ONCE" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="flex-1">
                <CalendarPicker value={date} min={today} onChange={setDate} />
              </div>
              <TimePicker value={time} onChange={setTime} notBefore={date === today ? nowTime : null} />
            </div>
            <ScheduleSummary
              text={T("Sends on {date} at {time}", { date: dateLabel(date), time })}
              warning={date === today && time <= nowTime ? T("This time has already passed today. Choose a later time.") : null}
              note={(() => {
                const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
                return days === 0 ? T("Today") : days === 1 ? T("Tomorrow") : T("In {count} days", { count: days });
              })()}
            />
          </div>
        ) : null}
        {when === "WEEKLY" ? (
          <div className="flex flex-col gap-3">
            <WeekdayPicker value={weekday} onChange={setWeekday} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <TimePicker value={time} onChange={setTime} />
              <div className="flex-1">
                <ScheduleSummary text={T("Every {day} at {time}", { day: T(WEEKDAYS[weekday]), time })} />
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button type="submit" disabled={pending || disabled}>
          {when === "NOW" ? <Send /> : <CalendarClock />}
          {when === "NOW" ? T("Send now") : T("Schedule")}
        </Button>
        <span className="text-sm text-muted-foreground">{T("Recipients: {count}", { count: recipients })}</span>
      </div>
    </form>
  );
}

export function MessagePlanActions({ id, active, canResume }: { id: string; active: boolean; canResume: boolean }) {
  const T = useT();
  const { run, pending } = useManagementMutation();
  const url = `/api/management/telegram/messages/${id}`;
  return (
    <div className="flex gap-1.5">
      {active ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(url, "PATCH", { workspace: "teacher", active: false }, "Paused.")}>
          <Pause />
          {T("Pause")}
        </Button>
      ) : canResume ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(url, "PATCH", { workspace: "teacher", active: true }, "Resumed.")}>
          <Play />
          {T("Resume")}
        </Button>
      ) : null}
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="ghost" disabled={pending} aria-label={T("Delete")}>
            <Trash2 />
          </Button>
        }
        title={T("Delete this message?")}
        description={T("It won't be sent any more, and its delivery history is removed.")}
        confirmLabel={T("Delete")}
        cancelLabel={T("Cancel")}
        destructive
        onConfirm={async () => {
          await run(`${url}?workspace=teacher`, "DELETE", null, "Deleted.");
        }}
      />
    </div>
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
