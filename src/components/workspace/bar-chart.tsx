"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/*
 * Single-series bar chart (dataviz method: one hue, no legend; the title names the series).
 * Thin marks with 4px rounded data-ends on the baseline and 2px gaps, a recessive axis,
 * a hover and focus tooltip on every bar, and a table view for screen readers and exact values.
 */

export type BarDatum = { key: string; label: string; value: number; detail?: string };

type BarChartProps = {
  title: string;
  description?: string;
  data: BarDatum[];
  /** "columns" for time series, "rows" for named categories with long labels. */
  layout?: "columns" | "rows";
  /** Appended to values, for example "%". A string (not a function) so server pages can pass it. */
  valueSuffix?: string;
  /** Upper bound of the scale (for percentages). Defaults to the data maximum. */
  max?: number;
  emptyMessage?: string;
  valueLabel?: string;
};

export function BarChart({
  title,
  description,
  data,
  layout = "columns",
  valueSuffix = "",
  max,
  emptyMessage = "No data for this period yet.",
  valueLabel = "Value"
}: BarChartProps) {
  const formatValue = (value: number) => `${value}${valueSuffix}`;
  const [active, setActive] = React.useState<string | null>(null);
  const top = Math.max(max ?? 0, ...data.map((datum) => datum.value), 1);
  const isEmpty = data.length === 0 || data.every((datum) => datum.value === 0);
  const headingId = React.useId();
  const activeDatum = data.find((datum) => datum.key === active) ?? null;

  return (
    <figure className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6" aria-labelledby={headingId}>
      <figcaption className="flex flex-col gap-0.5">
        <h3 id={headingId} className="card-title">
          {title}
        </h3>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </figcaption>

      {isEmpty ? (
        <p className="rounded-lg bg-muted/60 px-4 py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      ) : layout === "columns" ? (
        <div className="flex flex-col gap-2">
          <div className="relative h-44" onMouseLeave={() => setActive(null)}>
            {/* Recessive scale: max gridline and baseline only. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" aria-hidden="true">
              <span className="absolute -top-2.5 right-0 bg-card pl-1 text-xs tabular-nums text-muted-foreground">{formatValue(top)}</span>
            </div>
            <div className="absolute inset-0 flex items-end gap-[2px] border-b border-border" role="list" aria-label={title}>
              {data.map((datum) => (
                <div
                  key={datum.key}
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${datum.label}: ${formatValue(datum.value)}`}
                  onMouseEnter={() => setActive(datum.key)}
                  onFocus={() => setActive(datum.key)}
                  onBlur={() => setActive(null)}
                  className="group relative flex h-full flex-1 items-end focus-visible:outline-none"
                >
                  <div
                    className={cn(
                      "w-full rounded-t-[4px] bg-primary transition-opacity group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-1",
                      active && active !== datum.key && "opacity-50"
                    )}
                    style={{ height: datum.value === 0 ? 0 : `max(2px, ${(datum.value / top) * 100}%)` }}
                  />
                </div>
              ))}
            </div>
            {activeDatum ? (
              <div
                role="status"
                className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-border bg-card px-2 py-1 text-xs shadow-panel"
              >
                <strong className="tabular-nums">{formatValue(activeDatum.value)}</strong>{" "}
                <span className="text-muted-foreground">{activeDatum.detail ?? activeDatum.label}</span>
              </div>
            ) : null}
          </div>
          {/* Sparse x labels (first, middle, last) so they never collide. */}
          <div className="flex justify-between text-xs text-muted-foreground" aria-hidden="true">
            <span>{data[0]?.label}</span>
            <span>{data[Math.floor(data.length / 2)]?.label}</span>
            <span>{data[data.length - 1]?.label}</span>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={title}>
          {data.map((datum) => (
            <li key={datum.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{datum.label}</span>
                <span className="shrink-0 font-medium tabular-nums">{formatValue(datum.value)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(datum.value / top) * 100}%` }} />
              </div>
              {datum.detail ? <span className="text-xs text-muted-foreground">{datum.detail}</span> : null}
            </li>
          ))}
        </ul>
      )}

      {!isEmpty ? (
        <details className="text-sm">
          <summary className="w-fit cursor-pointer rounded-md py-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Show as table
          </summary>
          <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">{title}</caption>
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    {layout === "columns" ? "Period" : "Item"}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {valueLabel}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((datum) => (
                  <tr key={datum.key} className="border-t border-border">
                    <td className="px-3 py-1.5">{datum.detail ?? datum.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatValue(datum.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </figure>
  );
}
