import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/server/workspace";

/*
 * Admin-only area (overview, users, subjects, categories, instructors, analytics, assistant, knowledge base).
 * The role check sits ABOVE this group's loading boundary, so a teacher receives a real HTTP redirect to the
 * Teacher Workspace before anything is streamed (Prompt 09 acceptance audit). Each page still calls
 * requireAdmin itself (defence in depth); the parent /admin layout handles signed-out visitors.
 */
export default async function AdminOnlyLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/admin");
  if (user.role !== UserRole.ADMIN) redirect(homeForRole(user.role));
  return children;
}
