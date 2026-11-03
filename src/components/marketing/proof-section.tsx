import { Mail, TrendingUp, UserRound } from "lucide-react";

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
  learnerMomentum: Array<{
    user: {
      name: string;
    };
    course: {
      title: string;
    };
    progress: number;
  }>;
  supportEmail?: string | null;
};

export function ProofSection({
  locale,
  instructors,
  learnerMomentum,
  supportEmail
}: ProofSectionProps) {
  return (
    <Section>
      <Container className="space-y-10">
        <SectionHeading
          eyebrow={locale === "uz" ? "Ishonch va dalillar" : "Trust and proof"}
          title={
            locale === "uz"
              ? "Dars berayotgan insonlar, progress qilayotgan o'quvchilar va oilalar kutishi mumkin bo'lgan yordamni ko'rsating."
              : "Show the people teaching, the learners progressing, and the support families can expect."
          }
          description={
            locale === "uz"
              ? "Bu bo'limlar instruktor yozuvlari va maxfiylikni saqlaydigan anonim o'quvchi momentum namunalari bilan qurilgan, shuning uchun bosh sahifa ishonch va xavfsizlikni birga ushlab turadi."
              : "These sections are built from instructor records and privacy-safe learner momentum snapshots, so the homepage balances trust with responsible data handling."
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
                  className="rounded-[1.5rem] border border-border/70 bg-secondary/35 p-5"
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
            <Card>
              <CardHeader className="space-y-3">
                <CardTitle className="text-3xl">
                  {locale === "uz" ? "O'quvchi sur'ati" : "Learner momentum"}
                </CardTitle>
                <p className="text-sm leading-7 text-muted-foreground">
                  {locale === "uz"
                    ? "Anonim momentum namunasi tashrif buyuruvchilarga umumiy maqtovdan ko'ra aniqroq signal beradi va o'quvchi maxfiyligini saqlaydi."
                    : "An anonymized momentum snapshot gives visitors a clearer signal than generic praise while protecting learner privacy."}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {learnerMomentum.map((entry) => (
                  <div
                    key={`${entry.user.name}-${entry.course.title}`}
                    className="rounded-[1.5rem] bg-white/80 p-5"
                  >
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <UserRound className="h-4 w-4" />
                      {entry.user.name}
                    </div>
                    <p className="mt-3 font-medium text-foreground">{entry.course.title}</p>
                    <div className="mt-4 flex items-center justify-between gap-4">
                      <div className="h-2 flex-1 rounded-full bg-secondary">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${Math.max(6, Math.min(entry.progress, 100))}%` }}
                        />
                      </div>
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        {entry.progress}%
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-[linear-gradient(180deg,rgba(248,245,239,0.95),rgba(255,255,255,0.92))]">
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
                  <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-foreground">
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
