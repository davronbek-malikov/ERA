import { WorkspacePage } from "@/components/layout/app-shell";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getCurrentUser } from "@/lib/auth";

type AdminShellProps = {
  children: React.ReactNode;
  /** Kept for existing call sites; the shell now works out the active item from the URL. */
  currentPath?: string;
};

/**
 * The existing /admin editors render inside the shared workspace shell: instructors see the
 * Teacher Workspace navigation, admins the Admin Workspace navigation. Access is still decided
 * by each page and server action, not by this shell.
 */
export async function AdminShell({ children }: AdminShellProps) {
  const currentUser = await getCurrentUser();
  const workspace = currentUser?.role === "INSTRUCTOR" ? "teacher" : "admin";

  return (
    <WorkspaceShell workspace={workspace}>
      <WorkspacePage className="space-y-8">{children}</WorkspacePage>
    </WorkspaceShell>
  );
}
