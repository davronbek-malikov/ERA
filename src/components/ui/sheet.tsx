"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Drawers and sheets, built on the same Radix Dialog as `dialog.tsx`.
 * - side="right": desktop quick view or edit (480px).
 * - side="left": mobile navigation.
 * - side="bottom": mobile sheets (filters, menus). The assistant uses its own panel instead.
 */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

const sheetVariants = cva(
  "fixed z-overlay flex flex-col gap-4 bg-card shadow-panel duration-base data-[state=open]:animate-in data-[state=closed]:animate-out",
  {
    variants: {
      side: {
        right:
          "inset-y-0 right-0 w-full max-w-[30rem] border-l border-border data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
        left: "inset-y-0 left-0 w-[min(85vw,20rem)] border-r border-border data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
        bottom:
          "inset-x-0 bottom-0 max-h-[92vh] rounded-t-2xl border-t border-border pb-[env(safe-area-inset-bottom)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
      }
    },
    defaultVariants: {
      side: "right"
    }
  }
);

type SheetContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> &
  VariantProps<typeof sheetVariants> & {
    title: string;
    description?: string;
    /** Visually hide the title (it stays available to screen readers). */
    hideTitle?: boolean;
  };

const SheetContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, SheetContentProps>(
  ({ side, className, children, title, description, hideTitle, ...props }, ref) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-overlay bg-foreground/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
        {side === "bottom" ? (
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
        ) : null}
        <div className={cn("flex items-start justify-between gap-4 px-4 pt-4 sm:px-6", side === "bottom" && "pt-0")}>
          <div className={cn("flex flex-col gap-1", hideTitle && "sr-only")}>
            <DialogPrimitive.Title className="section-title">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-sm text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="size-4" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
);
SheetContent.displayName = "SheetContent";

export { Sheet, SheetClose, SheetContent, SheetTrigger };
