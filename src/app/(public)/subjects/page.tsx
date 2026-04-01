import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { createMetadata } from "@/lib/site";
import { getSubjectsWithCounts } from "@/server/courses";

export const metadata: Metadata = createMetadata({
  title: "Subjects",
  description: "Browse subject areas across AI, mathematics, English, and exam preparation.",
  path: "/subjects"
});

export default async function SubjectsPage() {
  const locale = await getLocale();
  const t = getMessages(locale);
  const subjects = await getSubjectsWithCounts();

  return (
    <Section>
      <Container className="space-y-12">
        <SectionHeading
          eyebrow={locale === "uz" ? "Fanlar" : "Subjects"}
          title={t.subjects.title}
          description={t.subjects.description}
        />

        {subjects.length === 0 ? (
          <EmptyState
            title={t.subjects.noSubjectsTitle}
            description={t.subjects.noSubjectsDescription}
            actionLabel={t.subjects.openAdmin}
            actionHref="/admin"
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {subjects.map((subject) => (
              <Card key={subject.id}>
                <CardHeader className="space-y-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="secondary" className="w-fit">
                      {subject.name}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {subject.categories.reduce((count, category) => count + category._count.courses, 0)}{" "}
                      {t.subjects.courses}
                    </span>
                  </div>
                  <CardTitle className="text-3xl">{subject.name}</CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                  <p className="text-sm leading-7 text-muted-foreground">
                    {subject.description ??
                      t.subjects.fallback}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {subject.categories.map((category) => (
                      <Badge key={category.id} variant="outline">
                        {category.name}
                      </Badge>
                    ))}
                  </div>

                  <Link
                    href={`/subjects/${subject.slug}`}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary"
                  >
                    {t.subjects.exploreSubject}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Container>
    </Section>
  );
}
