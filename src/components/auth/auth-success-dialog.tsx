"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import type { Locale } from "@/lib/i18n";

type AuthSuccessDialogProps = {
  locale: Locale;
  userName: string | null;
};

function removeAuthFeedback(pathname: string, searchParams: URLSearchParams) {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.delete("signedIn");
  nextParams.delete("welcome");

  const query = nextParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function AuthSuccessDialog({ locale, userName }: AuthSuccessDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shouldOpen = searchParams.get("signedIn") === "1";
  const [open, setOpen] = useState(shouldOpen);

  useEffect(() => {
    setOpen(shouldOpen);
  }, [shouldOpen]);

  const copy = useMemo(() => {
    if (locale === "uz") {
      return {
        title: userName ? `Xush kelibsiz, ${userName}!` : "Xush kelibsiz!",
        description:
          "Siz tizimga muvaffaqiyatli kirdingiz. Akkauntingiz endi sayt bo'ylab faol holatda ko'rinadi."
      };
    }

    return {
      title: userName ? `Welcome back, ${userName}!` : "Welcome back!",
      description:
        "You are signed in successfully. Your account state is now active across the site."
    };
  }, [locale, userName]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      router.replace(removeAuthFeedback(pathname, new URLSearchParams(searchParams.toString())), {
        scroll: false
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[min(92vw,28rem)] rounded-xl border border-success/20 bg-card p-0 sm:w-[min(92vw,30rem)]">
        <div className="overflow-hidden rounded-xl">
          <div className="bg-success/10 px-6 py-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10 text-success">
              <CheckCircle2 className="h-6 w-6" />
            </div>
          </div>
          <DialogHeader className="px-6 pb-6 pt-5">
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription className="text-sm leading-7">
              {copy.description}
            </DialogDescription>
          </DialogHeader>
        </div>
      </DialogContent>
    </Dialog>
  );
}
