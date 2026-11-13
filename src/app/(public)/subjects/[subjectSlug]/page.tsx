import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { SectionHeading } from "@/components/marketing/section-heading";
import { SubjectCourseGroups } from "@/components/subjects/subject-course-groups";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createMetadata } from "@/lib/site";
import { formatDurationSummary } from "@/lib/format";
import { getLocale } from "@/lib/i18n-server";
import { getSubjectBySlug } from "@/server/courses";

export const dynamic = "force-static";
export const revalidate = 3600;

type SubjectDetailPageProps = {
  params: Promise<{
    subjectSlug: string;
  }>;
};

export default async function SubjectDetailPage({ params }: SubjectDetailPageProps) {
  const { subjectSlug } = await params;
  const locale = await getLocale();
  const subject = await getSubjectBySlug(subjectSlug);

  if (!subject) {
    notFound();
  }

  const totalCourses = subject.categories.reduce(
    (count, category) => count + category.courses.length,
    0
  );

  return (
    <Section>
      <Container className="space-y-12">
        <div className="grid gap-8 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-6">
            <Badge>{subject.name}</Badge>
            <SectionHeading
              eyebrow={locale === "uz" ? "Fan haqida" : "Subject Overview"}
              title={
                locale === "uz"
                  ? `${subject.name} kurslari aniq progress atrofida qurilgan.`
                  : `${subject.name} courses built around clear progression.`
              }
              description={
                subject.description ??
                (locale === "uz"
                  ? "Bu fan kategoriyalar, kurslar va darslarni platforma kengaygani sari ham ko'rish oson bo'lib qoladigan tuzilma ichida birlashtiradi."
                  : "This subject groups categories, courses, and lessons into a structure that stays easy to browse as the platform expands.")
              }
            />
          </div>

          <Card className="h-fit">
            <CardContent className="grid gap-6 p-6 sm:grid-cols-2">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                  {locale === "uz" ? "Kategoriyalar" : "Categories"}
                </p>
                <p className="mt-3 font-display text-4xl">{subject.categories.length}</p>
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                  {locale === "uz" ? "Kurslar" : "Courses"}
                </p>
                <p className="mt-3 font-display text-4xl">{totalCourses}</p>
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                  {locale === "uz" ? "Instruktorlar" : "Instructors"}
                </p>
                <p className="mt-3 font-display text-4xl">{subject.instructorCount}</p>
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                  {locale === "uz" ? "O'qish vaqti" : "Study Time"}
                </p>
                <p className="mt-3 font-display text-4xl">
                  {formatDurationSummary(subject.totalDurationMinutes, locale)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {subject.topOutcomes.length > 0 ? (
          <Card>
            <CardContent className="space-y-5 p-6">
              <div className="space-y-3">
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                  {locale === "uz" ? "Fan natijalari" : "Subject Outcomes"}
                </p>
                <h2 className="font-display text-3xl">
                  {locale === "uz" ? "O'quvchilar bu fandan nimalarni egallaydi" : "What learners build in this subject"}
                </h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {subject.topOutcomes.map((outcome) => (
                  <div key={outcome} className="rounded-xl bg-secondary/35 px-4 py-4">
                    <p className="text-sm leading-7 text-muted-foreground">{outcome}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <SubjectCourseGroups locale={locale} categories={subject.categories} />
      </Container>
    </Section>
  );
}

export async function generateMetadata({ params }: SubjectDetailPageProps): Promise<Metadata> {
  const { subjectSlug } = await params;
  const subject = await getSubjectBySlug(subjectSlug);

  if (!subject) {
    return createMetadata({
      title: "Subject Not Found",
      description: "The requested subject could not be found.",
      path: `/subjects/${subjectSlug}`
    });
  }

  return createMetadata({
    title: subject.name,
    description:
      subject.description ??
      `Explore ${subject.name} courses, categories, and structured lesson pathways.`,
    path: `/subjects/${subject.slug}`
  });
}
