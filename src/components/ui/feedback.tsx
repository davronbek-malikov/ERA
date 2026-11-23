import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { CheckCircle2, CircleAlert, Info, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/* Skeleton: placeholder that matches the final layout while content loads. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden="true" {...props} />;
}

/* Alert: an inline banner for a page or section state (offline, quota, preview mode). */
const alertVariants = cva("flex items-start gap-3 rounded-xl border p-4 text-sm", {
  variants: {
    variant: {
      info: "border-primary/20 bg-primary/5 text-foreground",
      success: "border-success/20 bg-success/5 text-foreground",
      warning: "border-warning/30 bg-warning/10 text-foreground",
      error: "border-error/20 bg-error/5 text-foreground"
    }
  },
  defaultVariants: {
    variant: "info"
  }
});

const alertIcons = {
  info: <Info className="size-4 text-primary" aria-hidden="true" />,
  success: <CheckCircle2 className="size-4 text-success" aria-hidden="true" />,
  warning: <TriangleAlert className="size-4 text-warning-foreground" aria-hidden="true" />,
  error: <CircleAlert className="size-4 text-error" aria-hidden="true" />
};

type AlertProps = VariantProps<typeof alertVariants> & {
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function Alert({ variant, title, children, action, className }: AlertProps) {
  const tone = variant ?? "info";

  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn(alertVariants({ variant }), className)}>
      <span className="mt-0.5 shrink-0">{alertIcons[tone]}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-muted-foreground">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* Progress: course or lesson completion. Always pair with a visible label. */
type ProgressProps = {
  value: number;
  /** Accessible name, for example "Course progress". */
  label: string;
  className?: string;
  tone?: "primary" | "success";
};

export function Progress({ value, label, className, tone = "primary" }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-secondary", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-base", tone === "success" ? "bg-success" : "bg-primary")}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/* Kbd: keyboard shortcut hint. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[0.6875rem] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}
