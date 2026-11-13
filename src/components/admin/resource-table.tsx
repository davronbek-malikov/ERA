import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";

type ResourceTableProps = {
  title: string;
  columns: string[];
  rows: React.ReactNode[][];
};

export function ResourceTable({ title, columns, rows }: ResourceTableProps) {
  return (
    // min-w-0 lets the card shrink inside grid layouts so the table scrolls instead of widening the page.
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-3xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            title="No records yet"
            description="Once content is created, it will appear here for review and editing."
          />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-3">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column}
                      className="px-4 py-2 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${title}-${index}`} className="rounded-2xl bg-secondary/30">
                    {row.map((cell, cellIndex) => (
                      <td
                        key={`${title}-${index}-${cellIndex}`}
                        className="px-4 py-4 text-sm first:rounded-l-2xl last:rounded-r-2xl"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
