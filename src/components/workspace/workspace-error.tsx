"use client";

import { useEffect } from "react";
import { CircleAlert } from "lucide-react";

import { WorkspacePage } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";

/** Route-level error state for the workspaces: plain message, one retry action, no technical detail. */
export function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <WorkspacePage width="narrow">
      <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-error/10 text-error" aria-hidden="true">
          <CircleAlert className="size-5" />
        </span>
        <h1 className="card-title">This page couldn&apos;t load</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Something went wrong while loading your data. Try again in a moment. If it keeps happening, contact the ERA team.
        </p>
        <Button onClick={reset} variant="outline">
          Try again
        </Button>
      </div>
    </WorkspacePage>
  );
}
