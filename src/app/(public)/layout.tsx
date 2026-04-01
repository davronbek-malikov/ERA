import { AuthSuccessDialog } from "@/components/auth/auth-success-dialog";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { getCurrentUser } from "@/lib/auth";
import { getLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function PublicLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [currentUser, locale] = await Promise.all([getCurrentUser(), getLocale()]);

  return (
    <>
      <Navbar user={currentUser} />
      <AuthSuccessDialog locale={locale} userName={currentUser?.name ?? null} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
