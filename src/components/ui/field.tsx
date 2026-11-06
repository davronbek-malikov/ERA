import * as React from "react";

import { cn } from "@/lib/utils";

const Label = React.forwardRef<HTMLLabelElement, React.ComponentProps<"label">>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn("text-sm font-medium text-foreground", className)} {...props} />
  )
);
Label.displayName = "Label";

/** IDs to pass as `aria-describedby` on the control inside a `Field`. */
export function fieldDescribedBy(id: string, options: { hint?: React.ReactNode; error?: React.ReactNode }) {
  return [options.hint ? `${id}-hint` : null, options.error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ") || undefined;
}

type FieldProps = {
  /** The control's id. Hint and error ids derive from it. */
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * Label above, control, then hint and error below. Set `aria-describedby` on the control
 * with `fieldDescribedBy`, and `aria-invalid` when there is an error.
 */
function Field({ id, label, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="ml-0.5 text-error" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { Field, Label };
