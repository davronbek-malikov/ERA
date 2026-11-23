import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/*
 * Small building blocks shared by the workspace pages. They keep pages flat:
 * one bordered strip for metrics and plain bordered lists, not a card per item.
 */

export type Metric = { label: string; value: React.ReactNode; hint?: React.ReactNode };

/** A row of key numbers in one bordered panel, divided rather than boxed. */
export function StatStrip({ metrics, className }: { metrics: Metric[]; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card md:grid-cols-[repeat(var(--cols),minmax(0,1fr))]",
        className
      )}
      style={{ "--cols": metrics.length } as React.CSSProperties}
    >
      {metrics.map((metric, index) => (
        <div
          key={metric.label}
          className={cn(
            "flex flex-col gap-1 border-border p-4",
            index % 2 === 1 && "border-l",
            index >= 2 && "border-t md:border-t-0",
            index > 0 && "md:border-l"
          )}
        >
          <dt className="text-xs font-medium text-muted-foreground">{metric.label}</dt>
          <dd className="metric-value">{metric.value}</dd>
          {metric.hint ? <dd className="text-xs text-muted-foreground">{metric.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** Section title with an optional "View all" style action. */
export function SectionHeader({ title, action, description }: { title: string; action?: React.ReactNode; description?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="flex flex-col gap-0.5">
        <h2 className="section-title">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** A plain bordered list. Children are <li> rows. */
export function ListPanel({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {children}
    </ul>
  );
}

export function ListRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3", className)}>{children}</li>;
}

export type FilterSelect = {
  name: string;
  label: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
};

/**
 * Search and filters as a plain GET form, so filters live in the URL (IA §9.3) and work
 * without JavaScript. Filtering always happens in the server query.
 */
export function FilterBar({
  action,
  query,
  searchLabel,
  searchPlaceholder,
  selects = [],
  applyLabel,
  clearLabel
}: {
  action: string;
  query?: string;
  searchLabel: string;
  searchPlaceholder: string;
  selects?: FilterSelect[];
  applyLabel: string;
  clearLabel: string;
}) {
  const active = Boolean(query) || selects.some((select) => select.value);

  return (
    <form action={action} method="get" role="search" className="flex flex-col gap-3 md:flex-row md:items-end">
      <label className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{searchLabel}</span>
        <span className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input name="q" defaultValue={query} placeholder={searchPlaceholder} className="pl-9" type="search" />
        </span>
      </label>
      {selects.map((select) => (
        <label key={select.name} className="flex flex-col gap-1.5 md:w-48">
          <span className="text-xs font-medium text-muted-foreground">{select.label}</span>
          <Select name={select.name} defaultValue={select.value ?? ""}>
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      ))}
      <div className="flex gap-2">
        <Button type="submit" variant="outline">
          {applyLabel}
        </Button>
        {active ? (
          <Link href={action} className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            {clearLabel}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
