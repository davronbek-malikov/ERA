import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";

type ActivityFeedProps = {
  activity: Array<{
    id: string;
    message: string;
    type: string;
    createdAt: Date;
    user: {
      name: string;
    } | null;
  }>;
};

export function ActivityFeed({ activity }: ActivityFeedProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activity.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Recent platform events will appear here once admins start creating and updating content."
          />
        ) : (
          activity.map((item) => (
            <div key={item.id} className="rounded-[1.5rem] border border-border/70 bg-secondary/30 p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                  {item.type.replaceAll("_", " ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.createdAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                  })}
                </p>
              </div>
              <p className="mt-3 text-sm leading-7">{item.message}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {item.user?.name ?? "System"}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
