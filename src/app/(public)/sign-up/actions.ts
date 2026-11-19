"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getActionErrorRedirectPath } from "@/lib/app-errors";
import { localeCookieName } from "@/lib/i18n";
import { assertRateLimit, getRequestRateLimitKeyParts, RateLimitError } from "@/lib/rate-limit";
import { parseRegistration, registerStudent } from "@/server/registration";

/*
 * Student registration (Prompt 01). Creates a PENDING student account and shows the "waiting for your
 * teacher's approval" page. No session is created: a pending student can't open learning content until a
 * teacher or admin approves them. The role is never read from the form.
 */
export async function signUpAction(formData: FormData) {
  const field = (key: string) => formData.get(key);
  const parsed = parseRegistration({
    name: field("name"),
    email: field("email"),
    phone: field("phone"),
    password: field("password"),
    confirmPassword: field("confirmPassword"),
    preferredLanguage: field("preferredLanguage")
  });
  if (!parsed.ok) redirect(`/sign-up?error=${parsed.error}`);

  // At most 5 registrations per network per hour: stops scripted mass sign-ups.
  try {
    await assertRateLimit({ scope: "sign-up", maxAttempts: 5, windowMs: 60 * 60 * 1000, cooldownMs: 60 * 60 * 1000, keyParts: await getRequestRateLimitKeyParts() });
  } catch (error) {
    if (error instanceof RateLimitError) redirect("/sign-up?error=rate-limited");
    throw error;
  }

  let result: Awaited<ReturnType<typeof registerStudent>>;
  try {
    result = await registerStudent(parsed.input);
  } catch (error) {
    redirect(getActionErrorRedirectPath("/sign-up", error, "service-unavailable"));
  }
  if (!result.ok) redirect(`/sign-up?error=${result.error}`);

  // Show the rest of the site in the language the student chose.
  (await cookies()).set(localeCookieName, parsed.input.preferredLanguage, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/sign-up/pending");
}
