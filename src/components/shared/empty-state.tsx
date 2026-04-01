import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
};

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref
}: EmptyStateProps) {
  return (
    <Card className="border-dashed bg-white/60">
      <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center sm:px-10">
        <div className="space-y-2">
          <h3 className="font-display text-3xl">{title}</h3>
          <p className="max-w-xl text-sm leading-7 text-muted-foreground">{description}</p>
        </div>
        {actionLabel && actionHref ? (
          <Link href={actionHref} prefetch className={cn(buttonVariants({ variant: "outline" }))}>
            {actionLabel}
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
