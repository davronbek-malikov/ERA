import Link from "next/link";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export default async function NotFound() {
  const locale = await getLocale();
  const t = getMessages(locale);
  return (
    <Section>
      <Container>
        <Card className="mx-auto max-w-2xl">
          <CardContent className="space-y-5 p-8 text-center">
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">404</p>
            <h1 className="font-display text-5xl">{t.system.pageNotFound}</h1>
            <p className="text-sm leading-7 text-muted-foreground">
              {t.system.pageNotFoundDescription}
            </p>
            <div className="flex justify-center">
              <Link href="/" className={buttonVariants()}>
                {t.system.returnHome}
              </Link>
            </div>
          </CardContent>
        </Card>
      </Container>
    </Section>
  );
}
