"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createUserSession, hashPassword, normalizePhone } from "@/lib/auth";
import { getActionErrorRedirectPath } from "@/lib/app-errors";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string) {
  const digitsOnly = value.replace(/\D/g, "");
  return digitsOnly.length >= 10 && digitsOnly.length <= 15;
}

export async function signUpAction(formData: FormData) {
  const name = asString(formData, "name");
  const email = asString(formData, "email").toLowerCase();
  const rawPhone = asString(formData, "phone");
  const phone = normalizePhone(rawPhone) || null;
  const password = asString(formData, "password");
  const confirmPassword = asString(formData, "confirmPassword");

  if (!name || !email || !password || !confirmPassword) {
    redirect("/sign-up?error=missing-fields");
  }

  if (!isValidEmail(email)) {
    redirect("/sign-up?error=invalid-email");
  }

  if (phone && !isValidPhone(phone)) {
    redirect("/sign-up?error=invalid-phone");
  }

  if (password.length < 8) {
    redirect("/sign-up?error=password-too-short");
  }

  if (password !== confirmPassword) {
    redirect("/sign-up?error=password-mismatch");
  }

  let existingUser;

  try {
    existingUser = await retryOnDatabaseFailure(() =>
      prisma.user.findFirst({
        where: {
          OR: phone ? [{ email }, { phone }] : [{ email }]
        },
        select: {
          email: true,
          phone: true
        }
      })
    );
  } catch (error) {
    redirect(getActionErrorRedirectPath("/sign-up", error, "service-unavailable"));
  }

  if (existingUser?.email === email) {
    redirect("/sign-up?error=email-exists");
  }

  if (phone && existingUser?.phone === phone) {
    redirect("/sign-up?error=phone-exists");
  }

  let user;
  const passwordHash = await hashPassword(password);

  try {
    user = await retryOnDatabaseFailure(() =>
      prisma.user.create({
        data: {
          name,
          email,
          phone,
          passwordHash
        },
        select: {
          id: true,
          role: true
        }
      })
    );
  } catch (error) {
    redirect(getActionErrorRedirectPath("/sign-up", error, "service-unavailable"));
  }

  await createUserSession(user.id, user.role, name);
  revalidatePath("/", "layout");
  revalidatePath("/courses");
  revalidatePath("/my-learning");
  redirect("/courses?signedUp=1");
}
