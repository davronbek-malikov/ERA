import { AuthSuccessDialog } from "@/components/auth/auth-success-dialog";
import { EraGuideChatbot } from "@/components/era/era-guide-chatbot";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/i18n-server";

export default async function PublicLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const currentUser = session
    ? {
        id: session.userId,
        name: session.name,
        role: session.role
      }
    : null;

  return (
    <>
      <Navbar user={currentUser} />
      <AuthSuccessDialog locale={locale} userName={currentUser?.name ?? null} />
      <main className="relative">{children}</main>
      <Footer />
      <EraGuideChatbot locale={locale} />
    </>
  );
}
