import { changePasswordAction, saveSettingsAction, updateAccountProfileAction } from "@/app/admin/actions";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminShell } from "@/components/admin/admin-shell";
import { FormShell } from "@/components/admin/form-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentUser } from "@/lib/auth";
import { getSiteSettings } from "@/server/admin";

type AdminSettingsPageProps = {
  searchParams: Promise<{
    saved?: string;
    error?: string;
  }>;
};

export default async function AdminSettingsPage({ searchParams }: AdminSettingsPageProps) {
  const params = await searchParams;
  const [settings, currentUser] = await Promise.all([getSiteSettings(), getCurrentUser()]);

  return (
    <AdminShell currentPath="/admin/settings">
      <AdminPageHeader
        eyebrow="Settings"
        title="Manage platform-level configuration."
        description="Use settings to shape the global identity of the platform and keep key launch details in one place."
      />

      <div className="grid gap-8 lg:grid-cols-2">
        {params.saved === "settings" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 lg:col-span-2">
            Settings saved successfully.
          </div>
        ) : null}
        {params.saved === "account" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 lg:col-span-2">
            Account profile updated successfully.
          </div>
        ) : null}
        {params.saved === "password" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 lg:col-span-2">
            Password changed successfully.
          </div>
        ) : null}
        {params.error === "database-offline" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 lg:col-span-2">
            Database connection is unavailable, so settings could not be saved.
          </div>
        ) : null}
        {params.error === "missing-account-fields" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 lg:col-span-2">
            Please enter your name and email before saving your account profile.
          </div>
        ) : null}
        {params.error === "account-update-failed" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 lg:col-span-2">
            We could not update your account profile. Check for duplicate email or phone values.
          </div>
        ) : null}
        {params.error === "duplicate-email" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 lg:col-span-2">
            That email address is already in use by another account.
          </div>
        ) : null}
        {params.error === "duplicate-phone" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 lg:col-span-2">
            That phone number is already in use by another account.
          </div>
        ) : null}
        {params.error === "validation-failed" || params.error === "action-failed" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 lg:col-span-2">
            We could not save those settings. Please review the values and try again.
          </div>
        ) : null}
        {params.error === "missing-password-fields" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 lg:col-span-2">
            Fill in your current password and the new password fields to continue.
          </div>
        ) : null}
        {params.error === "password-too-short" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 lg:col-span-2">
            New passwords must be at least 8 characters long.
          </div>
        ) : null}
        {params.error === "password-mismatch" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 lg:col-span-2">
            New password and confirmation do not match.
          </div>
        ) : null}
        {params.error === "invalid-current-password" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 lg:col-span-2">
            Your current password was incorrect.
          </div>
        ) : null}
        {params.error === "password-change-failed" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 lg:col-span-2">
            We could not change your password.
          </div>
        ) : null}
        {params.error === "forbidden" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 lg:col-span-2">
            You do not have permission to change platform-wide settings.
          </div>
        ) : null}

        {currentUser?.role === "ADMIN" ? (
          <FormShell
            title="Brand Settings"
            description="Define the platform name, support copy, and core branding references."
          >
            <form action={saveSettingsAction} className="space-y-4">
              <Input name="platformName" defaultValue={settings?.platformName ?? "ERA Academy"} />
              <Input
                name="supportEmail"
                placeholder="Support email"
                defaultValue={settings?.supportEmail ?? ""}
              />
              <Input
                name="defaultPromoVideoUrl"
                placeholder="Default promo video URL"
                defaultValue={settings?.defaultPromoVideoUrl ?? ""}
              />
              <Textarea
                name="description"
                placeholder="Global platform description"
                defaultValue={settings?.description ?? ""}
              />
              <Button type="submit">Save Settings</Button>
            </form>
          </FormShell>
        ) : null}

        <FormShell
          title="My Account"
          description="Update the admin account details used for sign-in and notifications."
        >
          <form action={updateAccountProfileAction} className="space-y-4">
            <Input name="name" placeholder="Full name" defaultValue={currentUser?.name ?? ""} />
            <Input
              name="email"
              type="email"
              placeholder="Email address"
              defaultValue={currentUser?.email ?? ""}
            />
            <Input
              name="phone"
              placeholder="Phone number"
              defaultValue={currentUser?.phone ?? ""}
            />
            <Button type="submit">Save Account</Button>
          </form>
        </FormShell>

        <FormShell
          title="Change Password"
          description="Replace the default password with one only you know."
        >
          <form action={changePasswordAction} className="space-y-4">
            <Input name="currentPassword" type="password" placeholder="Current password" />
            <Input name="newPassword" type="password" placeholder="New password" />
            <Input name="confirmPassword" type="password" placeholder="Confirm new password" />
            <Button type="submit">Update Password</Button>
          </form>
        </FormShell>

        <FormShell
          title="Operational Notes"
          description="Track the operational items we can wire in next once the core product and deployment are approved."
        >
          <div className="space-y-4 text-sm leading-7 text-muted-foreground">
            <p>Maintenance mode can be added when you want a protected launch workflow.</p>
            <p>Enrollment automation can be connected once sign-in and payments are chosen.</p>
            <p>Video provider settings will be the next step if you want direct uploads inside admin.</p>
            <p>Email delivery can be connected for admissions, launch announcements, and notifications.</p>
          </div>
        </FormShell>
      </div>
    </AdminShell>
  );
}
