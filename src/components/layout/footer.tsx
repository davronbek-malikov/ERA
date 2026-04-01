import Link from "next/link";

import { EraLogo } from "@/components/brand/era-logo";
import { Container } from "@/components/layout/container";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export async function Footer() {
  const locale = await getLocale();
  const t = getMessages(locale);
  const footerColumns = [
    {
      title: t.footer.explore,
      links: [
        { label: t.navbar.subjects, href: "/subjects" },
        { label: t.navbar.courses, href: "/courses" },
        { label: t.navbar.learningPaths, href: "/#paths" }
      ]
    },
    {
      title: t.footer.platform,
      links: [
        { label: t.footer.about, href: "/" },
        { label: t.navbar.faq, href: "/#faq" },
        { label: t.footer.contact, href: "/" }
      ]
    }
  ];
  return (
    <footer className="border-t border-border/70 bg-white/72 backdrop-blur">
      <Container className="grid gap-12 py-16 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-accent p-1.5 shadow-soft">
              <EraLogo className="h-12 w-12" />
            </div>
            <p className="font-display text-3xl">ERA Academy</p>
          </div>
          <p className="max-w-xl text-sm leading-7 text-muted-foreground">
            {t.footer.description}
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          {footerColumns.map((column) => (
            <div key={column.title}>
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {column.title}
              </p>
              <div className="space-y-3">
                {column.links.map((link) => (
                  <Link key={link.label} href={link.href} className="block text-sm hover:text-primary">
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Container>
    </footer>
  );
}
