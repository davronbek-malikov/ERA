import { ArrowRight, GraduationCap, Users } from "lucide-react";

import { TrackedLink } from "@/components/analytics/tracked-link";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { type Locale } from "@/lib/i18n";

export function FinalCtaSection({ locale }: { locale: Locale }) {
  return (
    <Section>
      <Container>
        <Card className="overflow-hidden border-primary/10 bg-[linear-gradient(160deg,rgba(31,50,86,0.98),rgba(58,73,101,0.95))] text-white">
          <CardContent className="surface-grid grid gap-10 p-8 sm:p-10 lg:grid-cols-[1.1fr,0.9fr] lg:p-12">
            <div className="space-y-6">
              <p className="text-sm uppercase tracking-[0.18em] text-white/65">
                {locale === "uz" ? "Aniq yo'nalish bilan boshlang" : "Start With Direction"}
              </p>
              <h2 className="font-display text-4xl leading-tight text-balance sm:text-5xl">
                {locale === "uz"
                  ? "O'quvchilarga AI, matematika, ingliz tili va imtihon tayyorgarligida aniqroq keyingi qadam bering."
                  : "Give students a clearer next step in AI, mathematics, English, and exam preparation."}
              </h2>
              <p className="max-w-2xl text-base leading-8 text-white/78">
                {locale === "uz"
                  ? "ERA Academy endi tozaroq va jiddiyroq onlayn akademiya tajribasini xohlaydigan o'quvchilar, ota-onalar va mustaqil o'rganuvchilarga aniqroq murojaat qiladi. Katalogni ko'ring, yo'nalishlarni baholang va ko'rinadigan tuzilishga ega safarni tanlang."
                  : "ERA Academy now speaks more clearly to students, parents, and self-learners who want a cleaner, more serious online academy experience. Explore the catalog, review the pathways, and choose a journey with visible structure."}
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                <TrackedLink
                  href="/courses"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-[#f3cf79] px-6 text-base font-medium text-slate-950 transition hover:bg-[#efd28b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
                  eventName="cta_click"
                  eventData={{ location: "final_cta", cta: "explore_courses" }}
                >
                  {locale === "uz" ? "Kurslarni ko'rish" : "Explore Courses"}
                  <ArrowRight className="h-4 w-4" />
                </TrackedLink>
                <TrackedLink
                  href="/sign-up"
                  className={buttonVariants({
                    size: "lg",
                    variant: "outline",
                    className: "border-white/30 text-white hover:bg-white/10"
                  })}
                  eventName="cta_click"
                  eventData={{ location: "final_cta", cta: "create_account" }}
                >
                  {locale === "uz" ? "Talaba akkauntini yaratish" : "Create Student Account"}
                </TrackedLink>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[1.75rem] border border-white/10 bg-white/8 p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <h3 className="font-display text-2xl">
                  {locale === "uz" ? "O'quvchilar uchun" : "For students"}
                </h3>
                <p className="mt-3 text-sm leading-7 text-white/72">
                  {locale === "uz"
                    ? "Aniqroq darslarni, yaxshiroq progress ko'rsatkichlarini va sur'atni saqlashning sokinroq yo'lini tanlang."
                    : "Choose clearer lessons, better progression cues, and a calmer way to keep momentum."}
                </p>
              </div>
              <div className="rounded-[1.75rem] border border-white/10 bg-white/8 p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="font-display text-2xl">
                  {locale === "uz" ? "Ota-onalar uchun" : "For parents"}
                </h3>
                <p className="mt-3 text-sm leading-7 text-white/72">
                  {locale === "uz"
                    ? "Ishonch, aniqlik va ko'rinadigan akademik yo'nalish asosida qurilgan platformani ko'rib chiqing."
                    : "Review a platform designed around trust, clarity, and visible academic direction."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Container>
    </Section>
  );
}
