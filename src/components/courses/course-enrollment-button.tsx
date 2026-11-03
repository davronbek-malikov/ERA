"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, PlusCircle } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EnrollmentState = {
  authenticated: boolean;
  enrolled: boolean;
  canEnroll: boolean;
};

type CourseEnrollmentButtonProps = {
  courseSlug: string;
  size?: "sm" | "default" | "lg";
  className?: string;
  enrolledLabel?: string;
  enrollLabel?: string;
  signInPath?: string;
  fullWidth?: boolean;
  variant?: "default" | "outline" | "ghost" | "secondary";
};

export function CourseEnrollmentButton({
  courseSlug,
  size = "default",
  className,
  enrolledLabel = "Go to My Learning",
  enrollLabel = "Add to My Learning",
  signInPath,
  fullWidth = false,
  variant = "default"
}: CourseEnrollmentButtonProps) {
  const [state, setState] = useState<EnrollmentState>({
    authenticated: false,
    enrolled: false,
    canEnroll: false
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/courses/${courseSlug}/enroll`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as EnrollmentState | { error: string };

        if (!response.ok || "error" in payload || cancelled) {
          if (!cancelled && response.ok && "error" in payload) {
            setErrorMessage(payload.error);
          }
          return;
        }

        setState(payload);
        setErrorMessage(null);
      } catch {
        if (!cancelled) {
          setErrorMessage("Could not load your enrollment status.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [courseSlug]);

  function handleEnroll() {
    startTransition(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/courses/${courseSlug}/enroll`, {
            method: "POST"
          });
          const payload = (await response.json()) as EnrollmentState | { error: string };

          if (response.status === 401) {
            window.location.href = signInPath ?? `/sign-in?next=/courses/${courseSlug}`;
            return;
          }

          if (!response.ok || "error" in payload) {
            throw new Error(
              "error" in payload ? payload.error : "Could not add this course to My Learning."
            );
          }

          setState(payload);
          setErrorMessage(null);
        } catch (error) {
          setErrorMessage(
            error instanceof Error ? error.message : "Could not add this course to My Learning."
          );
        }
      })();
    });
  }

  if (state.authenticated && !state.canEnroll) {
    return null;
  }

  if (state.enrolled) {
    return (
      <Link
        href="/my-learning"
        prefetch
        className={cn(
          buttonVariants({ size, variant: "outline" }),
          fullWidth ? "w-full justify-center text-center" : "",
          className
        )}
      >
        <CheckCircle2 className="h-4 w-4" />
        {enrolledLabel}
      </Link>
    );
  }

  return (
    <div className={cn("space-y-2", fullWidth ? "w-full" : "")}>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={cn(fullWidth ? "w-full" : "", className)}
        onClick={handleEnroll}
        disabled={isPending}
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
        {enrollLabel}
      </Button>
      {errorMessage ? (
        <p className="text-sm text-rose-600">{errorMessage}</p>
      ) : null}
    </div>
  );
}
