import { ArrowRight, CheckCircle2, GraduationCap, Target, Users } from "lucide-react";

import { TrackedLink } from "@/components/analytics/tracked-link";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { SectionHeading } from "@/components/marketing/section-heading";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { type Locale } from "@/lib/i18n";

const academyAdvantages = [
  {
    title: "Structured progression",
    description:
      "Students move through sequenced lessons and pathways instead of guessing what to study next.",
    icon: Target
  },
  {
    title: "High-trust presentation",
    description:
      "Parents can evaluate subjects, levels, outcomes, and course shape without wading through clutter.",
    icon: Users
  },
  {
    title: "Academic momentum",
    description:
      "Courses are designed to turn motivation into a repeatable learning rhythm with clearer next steps.",
    icon: GraduationCap
  }
];

const audienceGroups = [
  {
    title: "Students",
    description:
      "For learners who need clearer explanations, stronger foundations, and a study path that feels organized."
  },
  {
    title: "Parents",
    description:
      "For families who want to see what is being taught, what level it fits, and how progress is meant to build."
  },
  {
    title: "Self-learners",
    description:
      "For ambitious learners who want a serious alternative to random videos and disconnected notes."
  }
];

const learningMethod = [
  "Begin with the right level, not with random difficulty jumps.",
  "Study through short, purposeful lesson modules inside a broader track.",
  "See what comes next so momentum is easier to keep.",
  "Use course outcomes and subject pages to choose with more confidence."
];

export function HomepageContentSection({ locale }: { locale: Locale }) {
  const localizedAcademyAdvantages =
    locale === "uz"
      ? [
          {
            title: "Tartibli rivojlanish",
            description:
              "O'quvchilar keyingi nima o'qishni taxmin qilmaydi, balki ketma-ket darslar va yo'nalishlar bo'yicha harakat qiladi.",
            icon: Target
          },
          {
            title: "Ishonchli taqdimot",
            description:
              "Ota-onalar fanlar, darajalar, natijalar va kurs tuzilishini ortiqcha chalkashliksiz baholay oladi.",
            icon: Users
          },
          {
            title: "Akademik sur'at",
            description:
              "Kurslar motivatsiyani aniq keyingi qadamlar bilan takrorlanadigan o'qish ritmiga aylantirish uchun ishlab chiqilgan.",
            icon: GraduationCap
          }
        ]
      : academyAdvantages;
  const localizedAudienceGroups =
    locale === "uz"
      ? [
          {
            title: "O'quvchilar",
            description:
              "Aniqroq tushuntirishlar, mustahkamroq poydevor va tartibli ko'rinadigan o'quv yo'lini xohlaydiganlar uchun."
          },
          {
            title: "Ota-onalar",
            description:
              "Nima o'qitilayotgani, qaysi darajaga mosligi va progress qanday qurilishini ko'rishni xohlaydigan oilalar uchun."
          },
          {
            title: "Mustaqil o'rganuvchilar",
            description:
              "Tasodifiy videolar va uzilgan qaydlar o'rniga jiddiy tizimni xohlaydigan intiluvchanlar uchun."
          }
        ]
      : audienceGroups;
  const localizedLearningMethod =
    locale === "uz"
      ? [
          "Tasodifiy qiyinlik sakrashlari bilan emas, mos darajadan boshlang.",
          "Katta yo'nalish ichidagi qisqa va maqsadli dars modullari orqali o'rganing.",
          "Keyingi qadamni oldindan ko'ring, shunda sur'atni saqlash osonroq bo'ladi.",
          "Ko'proq ishonch bilan tanlash uchun kurs natijalari va fan sahifalaridan foydalaning."
        ]
      : learningMethod;
  return (
    <Section id="about">
      <Container className="space-y-12">
        <SectionHeading
          eyebrow={locale === "uz" ? "ERA Academy haqida" : "About ERA Academy"}
          title={
            locale === "uz"
              ? "Tarqoq onlayn ta'limga nisbatan sokinroq va ishonchliroq alternativ."
              : "A calmer, more credible alternative to scattered online learning."
          }
          description={
            locale === "uz"
              ? "ERA Academy premium akademiya tajribasi sifatida shakllantirilmoqda: kamroq shovqin, kuchliroq tuzilma va o'quvchilar hamda oilalar uchun aniqroq ma'lumot."
              : "ERA Academy is being shaped as a premium academy experience: less noise, stronger structure, and clearer information for both students and families."
          }
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {localizedAcademyAdvantages.map((item) => {
            const Icon = item.icon;

            return (
              <Card key={item.title}>
                <CardContent className="space-y-5 p-8">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="space-y-3">
                    <h2 className="font-display text-3xl leading-tight">{item.title}</h2>
                    <p className="text-base leading-8 text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-5 p-8">
              <h2 className="font-display text-3xl leading-tight sm:text-4xl">
                {locale === "uz" ? "ERA Academy kimlar uchun" : "Who ERA Academy is for"}
              </h2>
              <p className="text-base leading-8 text-muted-foreground">
                {locale === "uz"
                  ? "Auditoriya bitta o'quvchi profili bilan cheklanmaydi, ammo ehtiyoj bir xil: jiddiy o'rganuvchilar yaxshiroq tizimni, oilalar esa o'qish jarayonida ko'proq ishonchni xohlaydi."
                  : "The audience is wider than one student profile, but the need is consistent: serious learners want a better system, and families want more confidence in the learning experience."}
              </p>
              <div className="grid gap-3">
                {localizedAudienceGroups.map((group) => (
                  <div key={group.title} className="rounded-2xl bg-secondary/65 px-4 py-4">
                    <p className="text-sm font-semibold text-foreground">{group.title}</p>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      {group.description}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-5 p-8">
              <h2 className="font-display text-3xl leading-tight sm:text-4xl">
                {locale === "uz" ? "O'quv modeli qanday ishlaydi" : "How the learning model works"}
              </h2>
              <p className="text-base leading-8 text-muted-foreground">
                {locale === "uz"
                  ? "ERA Academy kontent ombori emas, balki yo'naltirilgan akademiya kabi ishlaganda eng kuchli bo'ladi. Bu ko'rinadigan darajalar, aniqroq natijalar va bosim emas, ishonchni qo'llab-quvvatlaydigan ketma-ketlikni anglatadi."
                  : "ERA Academy is strongest when it behaves like a guided academy, not a content dump. That means visible levels, clearer outcomes, and a sequence that supports confidence instead of overwhelm."}
              </p>
              <div className="space-y-3">
                {localizedLearningMethod.map((point) => (
                  <div key={point} className="flex gap-3 rounded-2xl bg-card/80 p-4">
                    <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-primary" />
                    <p className="text-sm leading-7 text-muted-foreground">{point}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-primary/10 bg-muted">
          <CardContent className="space-y-5 p-8 sm:p-10">
            <h2 className="font-display text-3xl leading-tight sm:text-4xl">
              {locale === "uz"
                ? "Tasodifiy kontentdan yaxshiroq. Haqiqiy progress uchun yaxshiroq."
                : "Better than random content. Better for real progress."}
            </h2>
            <p className="max-w-4xl text-base leading-8 text-muted-foreground">
              {locale === "uz"
                ? "Internetda ta'lim materiali cheksiz, ammo ko'pligi o'quv rejasini yaratmaydi. ERA Academy o'quvchilar yo'nalishni tanlaydigan, safar shaklini ko'radigan va kamroq to'siq bilan davom etadigan joy sifatida qurilmoqda."
                : "The web has endless educational material, but abundance does not create a learning plan. ERA Academy is positioned as the place where students can choose a track, see the shape of the journey, and keep moving with less friction."}
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <TrackedLink
                href="/subjects"
                className={buttonVariants({ size: "lg" })}
                eventName="cta_click"
                eventData={{ location: "about_section", cta: "explore_subjects" }}
              >
                {locale === "uz" ? "Fan yo'nalishlarini ko'rish" : "Explore Subject Pathways"}
                <ArrowRight className="h-4 w-4" />
              </TrackedLink>
              <TrackedLink
                href="/courses"
                className={buttonVariants({ size: "lg", variant: "outline" })}
                eventName="cta_click"
                eventData={{ location: "about_section", cta: "view_catalog" }}
              >
                {locale === "uz" ? "Kurs katalogini ko'rish" : "View Course Catalog"}
              </TrackedLink>
            </div>
          </CardContent>
        </Card>
      </Container>
    </Section>
  );
}
