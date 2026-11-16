"use client";

import * as React from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, Clock } from "lucide-react";

import { useT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";

/*
 * Visual pickers for scheduling a Telegram message (ERA Assistant → Messages): a month calendar, a clock-style
 * time picker (hour and minute columns plus quick times) and a weekday picker. Dates are "YYYY-MM-DD" and times
 * "HH:MM" in the platform time zone (Seoul); the server converts them to instants.
 */

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Monday first, like the Uzbek calendar. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const QUICK_TIMES = ["09:00", "10:00", "12:00", "15:00", "18:00", "20:00"];
const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

const parse = (date: string) => new Date(`${date}T00:00:00Z`);
const format = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const value = parse(date);
  value.setUTCDate(value.getUTCDate() + days);
  return format(value);
};
export const weekdayOf = (date: string) => parse(date).getUTCDay();

export function useDateLabel() {
  const T = useT();
  return React.useCallback(
    (date: string) => {
      const value = parse(date);
      return T("{weekday}, {day} {month} {year}", {
        weekday: T(WEEKDAYS[value.getUTCDay()]),
        day: value.getUTCDate(),
        month: T(MONTHS[value.getUTCMonth()]).toLowerCase(),
        year: value.getUTCFullYear()
      });
    },
    [T]
  );
}

export function CalendarPicker({ value, min, onChange }: { value: string; min: string; onChange: (date: string) => void }) {
  const T = useT();
  const [month, setMonth] = React.useState(() => value.slice(0, 7));
  const first = `${month}-01`;
  const lead = (weekdayOf(first) + 6) % 7; // blank cells before the 1st (Monday-first grid)
  const firstDate = parse(first);
  const daysInMonth = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => addDays(first, index))];
  const shift = (delta: number) => {
    const next = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + delta, 1));
    setMonth(format(next).slice(0, 7));
  };
  const canGoBack = month > min.slice(0, 7);

  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} disabled={!canGoBack} className="rounded-lg p-1.5 hover:bg-muted disabled:opacity-30" aria-label={T("Previous month")}>
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold">
          {T(MONTHS[firstDate.getUTCMonth()])} {firstDate.getUTCFullYear()}
        </span>
        <button type="button" onClick={() => shift(1)} className="rounded-lg p-1.5 hover:bg-muted" aria-label={T("Next month")}>
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {WEEK_ORDER.map((day) => (
          <span key={day} className={day === 0 || day === 6 ? "text-primary/70" : undefined}>
            {T(SHORT_DAYS[day])}
          </span>
        ))}
      </div>
      <div role="grid" className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((date, index) =>
          date ? (
            <button
              key={date}
              type="button"
              disabled={date < min}
              onClick={() => onChange(date)}
              aria-pressed={date === value}
              aria-label={date}
              className={cn(
                "flex aspect-square items-center justify-center rounded-lg text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                date === value ? "bg-primary font-semibold text-primary-foreground shadow-soft" : "hover:bg-muted",
                date === min && date !== value && "ring-1 ring-primary/50"
              )}
            >
              {parse(date).getUTCDate()}
            </button>
          ) : (
            <span key={`blank-${index}`} />
          )
        )}
      </div>
      <div className="mt-2 flex gap-1.5">
        <button type="button" onClick={() => { onChange(min); setMonth(min.slice(0, 7)); }} className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted">
          {T("Today")}
        </button>
        <button type="button" onClick={() => { const next = addDays(min, 1); onChange(next); setMonth(next.slice(0, 7)); }} className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted">
          {T("Tomorrow")}
        </button>
      </div>
    </div>
  );
}

function Column({ items, value, onPick, isDisabled, label }: { items: string[]; value: string; onPick: (item: string) => void; isDisabled: (item: string) => boolean; label: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const selected = ref.current?.querySelector<HTMLElement>("[aria-pressed=true]");
    if (selected && ref.current) ref.current.scrollTop = selected.offsetTop - ref.current.clientHeight / 2 + selected.clientHeight / 2;
  }, [value]);
  return (
    <div ref={ref} role="listbox" aria-label={label} className="relative flex h-44 w-14 flex-col gap-0.5 overflow-y-auto rounded-lg bg-muted/40 p-1 [scrollbar-width:thin]">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          disabled={isDisabled(item)}
          aria-pressed={item === value}
          onClick={() => onPick(item)}
          className={cn(
            "shrink-0 rounded-md py-1.5 text-center text-sm tabular-nums transition-colors disabled:opacity-25",
            item === value ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-card"
          )}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

/** Clock-style time picker. `notBefore` ("HH:MM") greys out earlier times (today). */
export function TimePicker({ value, onChange, notBefore }: { value: string; onChange: (time: string) => void; notBefore?: string | null }) {
  const T = useT();
  const [hour, minute] = value.split(":");
  const tooEarly = (time: string) => Boolean(notBefore && time <= notBefore);
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:w-48">
      <div className="flex items-center justify-center gap-2">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-primary/30 bg-primary/5">
          <Clock className="size-5 text-primary" aria-hidden="true" />
        </div>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
      </div>
      <div className="flex items-start justify-center gap-2">
        <Column items={HOURS} value={hour} label={T("Hour")} onPick={(next) => onChange(`${next}:${minute}`)} isDisabled={(next) => tooEarly(`${next}:59`)} />
        <span className="pt-[4.5rem] text-lg font-semibold">:</span>
        <Column items={MINUTES} value={minute} label={T("Minute")} onPick={(next) => onChange(`${hour}:${next}`)} isDisabled={(next) => tooEarly(`${hour}:${next}`)} />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {QUICK_TIMES.map((time) => (
          <button
            key={time}
            type="button"
            disabled={tooEarly(time)}
            onClick={() => onChange(time)}
            className={cn(
              "rounded-full border px-2 py-1 text-xs tabular-nums transition-colors disabled:opacity-30",
              time === value ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border hover:bg-muted"
            )}
          >
            {time}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{T("Seoul time")}</span>
    </div>
  );
}

export function WeekdayPicker({ value, onChange }: { value: number; onChange: (day: number) => void }) {
  const T = useT();
  return (
    <div role="radiogroup" aria-label={T("Day")} className="grid grid-cols-7 gap-1.5">
      {WEEK_ORDER.map((day) => (
        <button
          key={day}
          type="button"
          role="radio"
          aria-checked={day === value}
          title={T(WEEKDAYS[day])}
          onClick={() => onChange(day)}
          className={cn(
            "rounded-xl border py-2 text-sm font-medium transition-colors",
            day === value ? "border-primary bg-primary text-primary-foreground shadow-soft" : "border-border hover:bg-muted"
          )}
        >
          {T(SHORT_DAYS[day])}
        </button>
      ))}
    </div>
  );
}

/** The confirmation line: exactly when the message goes out, and how far away that is. */
export function ScheduleSummary({ text, note, warning }: { text: string; note?: string | null; warning?: string | null }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-xl border p-3 text-sm", warning ? "border-warning/40 bg-warning/10" : "border-primary/30 bg-primary/5")}>
      <CalendarCheck className={cn("mt-0.5 size-4 shrink-0", warning ? "text-warning-foreground" : "text-primary")} aria-hidden="true" />
      <span className="flex flex-col">
        <span className="font-medium">{text}</span>
        {warning || note ? <span className="text-xs text-muted-foreground">{warning ?? note}</span> : null}
      </span>
    </div>
  );
}
