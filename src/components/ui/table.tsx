import * as React from "react";

import { cn } from "@/lib/utils";

/* Low-level table parts, for custom layouts. Most screens should use DataTable below. */

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    // relative: keeps absolutely positioned content (screen-reader-only labels) inside the scroll area.
    <div className="relative w-full overflow-x-auto rounded-xl border border-border bg-card">
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  )
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("bg-muted/60 [&_tr]:border-b", className)} {...props} />
  )
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  )
);
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn("border-b border-border transition-colors hover:bg-muted/40", className)} {...props} />
  )
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      scope="col"
      className={cn("h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  )
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("px-4 py-3 align-middle text-foreground", className)} {...props} />
  )
);
TableCell.displayName = "TableCell";

/* DataTable: a table on tablet and desktop, stacked cards on phones. */

export type DataTableColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /**
   * On phones: "title" is the card heading, "detail" is a labelled line, "hidden" is
   * left out. Show 3–4 fields at most on a card.
   */
  mobile?: "title" | "detail" | "hidden";
  align?: "left" | "right";
  className?: string;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  /** Accessible name for the table. */
  caption: string;
  /** Rendered in place of the rows when there are none; the header stays. */
  emptyState?: React.ReactNode;
  /** Row actions (for example a ⋯ menu), shown last on desktop and top-right on cards. */
  rowActions?: (row: T) => React.ReactNode;
  /** Screen-reader name of the actions column. */
  actionsLabel?: string;
};

export function DataTable<T>({ columns, rows, getRowKey, caption, emptyState, rowActions, actionsLabel = "Actions" }: DataTableProps<T>) {
  const titleColumn = columns.find((column) => column.mobile === "title") ?? columns[0];
  const detailColumns = columns.filter(
    (column) => column !== titleColumn && column.mobile !== "hidden"
  );

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead key={column.key} className={cn(column.align === "right" && "text-right")}>
                  {column.header}
                </TableHead>
              ))}
              {rowActions ? (
                <TableHead className="w-12">
                  <span className="sr-only">{actionsLabel}</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length + (rowActions ? 1 : 0)} className="py-10">
                  {emptyState}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={getRowKey(row)}>
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn(column.align === "right" && "text-right tabular-nums", column.className)}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}
                  {rowActions ? <TableCell className="text-right">{rowActions(row)}</TableCell> : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-10">{emptyState}</div>
        ) : (
          <ul className="flex flex-col gap-2" aria-label={caption}>
            {rows.map((row) => (
              <li key={getRowKey(row)} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 font-medium text-foreground">{titleColumn.cell(row)}</div>
                  {rowActions ? <div className="-mr-2 -mt-1 shrink-0">{rowActions(row)}</div> : null}
                </div>
                {detailColumns.length > 0 ? (
                  <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
                    {detailColumns.map((column) => (
                      <React.Fragment key={column.key}>
                        <dt className="text-muted-foreground">{column.header}</dt>
                        <dd className="min-w-0 text-foreground">{column.cell(row)}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
