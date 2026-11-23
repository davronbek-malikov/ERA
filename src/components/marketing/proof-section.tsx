import { Mail } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Locale } from "@/lib/i18n";

type ProofSectionProps = {
  locale: Locale;
  instructors: Array<{
    id: string;
    name: string;
    title: string | null;
    bio: string | null;
    _count: {
      courses: number;
    };
  }>;
  supportEmail?: string | null;
};

export function ProofSection({
  locale,
  instructors,
  supportEmail
}: ProofSectionProps) {
  return (
    <Section>
      <Container className="space-y-10">
        <SectionHeading
          eyebrow={locale === "uz" ? "Ishonch va dalillar" : "Trust and proof"}
          title={
            locale === "uz"
              ? "Dars berayotgan insonlar va oilalar kutishi mumkin bo'lgan yordam."
              : "The people teaching, and the support families can expect."
          }
          description={
            locale === "uz"
              ? "Har bir kurs haqiqiy instruktor tomonidan olib boriladi va savollar uchun aloqa doim ochiq."
              : "Every course is led by a real instructor, and support is always one message away."
          }
        />

        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <Card>
            <CardHeader className="space-y-3">
              <CardTitle className="text-3xl">
                {locale === "uz" ? "Instruktor ishonchliligi" : "Instructor credibility"}
              </CardTitle>
              <p className="text-sm leading-7 text-muted-foreground">
                {locale === "uz"
                  ? "Instruktor tarjimai hollari endi faqat admin ma'lumotlarida yashirin qolmay, ommaviy ishonch qatlamining bir qismi sifatida ko'rinadi."
                  : "Instructor bios now appear as part of the public proof layer instead of staying hidden inside admin data."}
              </p>
            </CardHeader>
            <CardContent className="grid gap-4">
              {instructors.map((instructor) => (
                <div
                  key={instructor.id}
                  className="rounded-xl border border-border/70 bg-secondary/35 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <p className="font-medium text-foreground">{instructor.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {instructor.title ?? (locale === "uz" ? "Instruktor" : "Instructor")}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {instructor._count.courses} {locale === "uz" ? "ta kurs" : "courses"}
                    </Badge>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">
                    {instructor.bio ??
                      (locale === "uz"
                        ? "Bu instruktor profili uchun biografiya tafsilotlari tayyorlanmoqda."
                        : "Biography details are being prepared for this instructor profile.")}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-6">
            <Card className="bg-muted">
              <CardContent className="space-y-3 p-6">
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                  {locale === "uz" ? "Ota-onalar uchun ochiqlik" : "Parent transparency"}
                </p>
                <p className="font-display text-3xl leading-tight">
                  {locale === "uz"
                    ? "Oilalar akademiya bilan qanday bog'lanishni va qanday tuzilmani kutishni bilishi kerak."
                    : "Families should know how to reach the academy and what kind of structure to expect."}
                </p>
                <p className="text-sm leading-7 text-muted-foreground">
                  {locale === "uz"
                    ? "Kurs darajasi, darslar soni, natijalar va instruktor ko'rinishi endi ommaviy tajribada ancha ravshan ko'rsatiladi."
                    : "Course level, lesson count, outcomes, and instructor visibility are now surfaced more clearly across the public experience."}
                </p>
                {supportEmail ? (
                  <div className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-medium text-foreground">
                    <Mail className="h-4 w-4 text-primary" />
                    {supportEmail}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </Container>
    </Section>
  );
}
