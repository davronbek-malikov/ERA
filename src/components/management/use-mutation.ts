"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { toast } from "@/components/ui/toast";

/*
 * One fetch helper for every Student Management form: JSON in, JSON out, the server's own error message shown
 * to the user, and a page refresh after success (pages are server-rendered from the database).
 */
export function useManagementMutation() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const run = React.useCallback(
    async (url: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body: Record<string, unknown> | null, success: string) => {
      setPending(true);
      try {
        const response = await fetch(url, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined
        });
        const payload = (await response.json().catch(() => null)) as ({ ok?: boolean; error?: string } & Record<string, unknown>) | null;
        if (!response.ok || !payload?.ok) {
          toast({ title: payload?.error ?? "That didn't work. Please try again.", variant: "error" });
          return null;
        }
        toast({ title: success, variant: "success" });
        router.refresh();
        return payload;
      } catch {
        toast({ title: "You seem to be offline. Nothing was saved.", variant: "error" });
        return null;
      } finally {
        setPending(false);
      }
    },
    [router]
  );

  return { run, pending };
}

/** A fresh key per form opening: retrying the same submission never records a payment twice. */
export function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
