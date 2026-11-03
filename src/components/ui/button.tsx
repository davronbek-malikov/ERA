import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl border border-transparent text-center font-medium leading-tight tracking-[-0.01em] transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px ring-offset-background",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-soft hover:bg-primary/94 hover:shadow-panel",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/84 hover:shadow-soft",
        outline:
          "border-border bg-white/90 text-foreground hover:border-primary/22 hover:bg-white hover:text-foreground hover:shadow-soft",
        ghost:
          "text-foreground hover:bg-accent/70 hover:text-foreground",
        danger:
          "bg-error text-error-foreground shadow-soft hover:bg-error/92 hover:shadow-panel"
      },
      size: {
        default: "h-11 px-4 text-[0.95rem]",
        md: "h-11 px-4 text-[0.95rem]",
        sm: "h-10 px-3.5 text-sm",
        lg: "h-12 px-5 text-[0.98rem]",
        icon: "h-10 w-10 px-0 py-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "md"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
