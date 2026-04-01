import { Card, CardContent } from "@/components/ui/card";

type StatsGridProps = {
  stats: Array<{
    label: string;
    value: string | number;
    detail: string;
  }>;
};

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</p>
            <p className="font-display text-5xl">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.detail}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
