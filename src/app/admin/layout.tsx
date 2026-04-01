import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { canAccessAdminStudio } from "@/lib/permissions";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
};

export default async function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in?next=/admin");
  }

  if (!canAccessAdminStudio(user.role)) {
    redirect("/sign-in?error=invalid-credentials&next=/admin");
  }

  return children;
}
