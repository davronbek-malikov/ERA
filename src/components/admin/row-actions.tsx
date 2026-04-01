"use client";

import Link from "next/link";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RowDeleteActionProps = {
  action: (formData: FormData) => Promise<void>;
  id: string;
  resourceName?: string;
};

export function RowDeleteAction({ action, id, resourceName = "this item" }: RowDeleteActionProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 px-3")}
        >
          Delete
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {resourceName}?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. Please confirm before removing {resourceName}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <button type="button" className={cn(buttonVariants({ variant: "ghost" }))}>
              Cancel
            </button>
          </DialogClose>
          <form action={action}>
            <input type="hidden" name="id" value={id} />
            <button type="submit" className={cn(buttonVariants({ variant: "outline" }))}>
              Confirm Delete
            </button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type RowEditLinkProps = {
  href: string;
};

export function RowEditLink({ href }: RowEditLinkProps) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 px-3")}>
      Edit
    </Link>
  );
}
