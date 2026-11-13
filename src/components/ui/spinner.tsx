import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type SpinnerProps = {
  className?: string;
  /** Announced to screen readers. Omit when a parent already describes the busy state. */
  label?: string;
};

export function Spinner({ className, label }: SpinnerProps) {
  return (
    <>
      <Loader2 className={cn("size-4 animate-spin", className)} aria-hidden="true" />
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}
