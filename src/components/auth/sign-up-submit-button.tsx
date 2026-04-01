"use client";

import { UserPlus } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n";

export function SignUpSubmitButton({ locale }: { locale: Locale }) {
  const { pending } = useFormStatus();
  const t = getMessages(locale);

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      <UserPlus className="h-4 w-4" />
      {pending
        ? locale === "uz"
          ? "Akkaunt yaratilmoqda..."
          : "Creating account..."
        : t.signUp.submit}
    </Button>
  );
}
