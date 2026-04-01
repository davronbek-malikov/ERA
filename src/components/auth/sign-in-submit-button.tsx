"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n";

export function SignInSubmitButton({ locale }: { locale: Locale }) {
  const { pending } = useFormStatus();
  const t = getMessages(locale);

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? t.signIn.submitting : t.signIn.submit}
    </Button>
  );
}
