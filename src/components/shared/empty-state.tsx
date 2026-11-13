import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  /** One sentence explaining why it's empty. */
  description: string;
  icon?: React.ReactNode;
  /** One primary action at most: a link (actionHref) or a custom element (action). */
  actionLabel?: string;
  actionHref?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon, actionLabel, actionHref, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center",
        className
      )}
    >
      {icon ? (
        <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <h3 className="card-title">{title}</h3>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {action ??
        (actionLabel && actionHref ? (
          <Link href={actionHref} prefetch className={cn(buttonVariants({ variant: "outline" }), "mt-1")}>
            {actionLabel}
          </Link>
        ) : null)}
    </div>
  );
}
