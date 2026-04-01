import Link from "next/link";
import { BrainCircuit, Calculator, FilePenLine, Languages } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Locale } from "@/lib/i18n";

const subjectIcons = {
  ai: BrainCircuit,
  mathematics: Calculator,
  english: Languages,
  "exam-preparation": FilePenLine
} as const;

type SubjectCardsSectionProps = {
  locale: Locale;
  subjects: Array<{
    name: string;
    slug: string;
    description: string | null;
    categories: Array<{
      _count: {
        courses: number;
      };
    }>;
  }>;
};

export function SubjectCardsSection({ locale, subjects }: SubjectCardsSectionProps) {
  return (
    <Section id="subjects">
      <Container className="space-y-10">
        <SectionHeading
          eyebrow={locale === "uz" ? "Fanlar" : "Subjects"}
          title={
            locale === "uz"
              ? "Fanlar marketing shovqini ichida yo'qolmasdan, tez ko'zdan kechiriladigan bo'lishi kerak."
              : "Subjects should feel easy to scan, not buried in marketing noise."
          }
          description={
            locale === "uz"
              ? "Har bir fan kartasi endi aniqroq mahsulot vazifasini bajaradi: yo'nalish nimani qamrab oladi, nechta kurs bor va o'quvchi keyin qayerga o'tishi kerak."
              : "Each subject card now plays a clearer product role: what the area covers, how many courses it includes, and where a student should go next."
          }
        />
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {subjects.map((subject) => {
            const Icon = subjectIcons[subject.slug as keyof typeof subjectIcons] ?? BrainCircuit;
            const courseCount = subject.categories.reduce(
              (sum, category) => sum + category._count.courses,
              0
            );

            return (
              <Link key={subject.slug} href={`/subjects/${subject.slug}`}>
                <Card className="min-h-[250px] transition duration-300 hover:-translate-y-1 hover:border-primary/20">
                <CardHeader className="space-y-6">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>{subject.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {subject.description ??
                      (locale === "uz"
                        ? "Kategoriyalar, kurslar va tartibli rivojlanishga ega aniq fan markazi."
                        : "A clear subject hub with categories, courses, and structured progression.")}
                  </p>
                  <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {locale === "uz"
                      ? `${subject.categories.length} ta kategoriya bo'yicha ${courseCount} ta kurs`
                      : `${courseCount} courses across ${subject.categories.length} categories`}
                  </p>
                </CardContent>
              </Card>
              </Link>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
