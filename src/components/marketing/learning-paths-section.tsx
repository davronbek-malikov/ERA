import { Check, ChevronRight } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Card, CardContent } from "@/components/ui/card";
import { type Locale } from "@/lib/i18n";

const learningPaths = [
  {
    name: "AI Foundations",
    level: "Beginner to Intermediate",
    steps: ["Prompt literacy", "Model intuition", "Applied workflows"]
  },
  {
    name: "Quantitative Confidence",
    level: "Foundation to Exam Ready",
    steps: ["Core algebra", "Problem solving", "Exam accuracy drills"]
  },
  {
    name: "English Excellence",
    level: "Intermediate to Advanced",
    steps: ["Reading structure", "Writing polish", "Vocabulary expansion"]
  }
];

export function LearningPathsSection({ locale }: { locale: Locale }) {
  const localizedLearningPaths =
    locale === "uz"
      ? [
          {
            name: "AI asoslari",
            level: "Boshlang'ichdan o'rta darajagacha",
            steps: ["Prompt savodxonligi", "Model tushunchasi", "Amaliy workflowlar"]
          },
          {
            name: "Miqdoriy ishonch",
            level: "Asosdan imtihonga tayyorgacha",
            steps: ["Asosiy algebra", "Masala yechish", "Imtihon aniqligi mashqlari"]
          },
          {
            name: "Ingliz tili mukammalligi",
            level: "O'rta darajadan ilg'orgacha",
            steps: ["O'qish tuzilmasi", "Yozuv sifati", "Lug'at boyligini oshirish"]
          }
        ]
      : learningPaths;
  return (
    <Section id="paths">
      <Container className="space-y-10">
        <SectionHeading
          eyebrow={locale === "uz" ? "O'quv yo'nalishlari" : "Learning Paths"}
          title={
            locale === "uz"
              ? "O'quv yo'nalishlari keyingi qadamni aniq ko'rsatishi kerak."
              : "Learning paths should make the next step obvious."
          }
          description={
            locale === "uz"
              ? "Har bir yo'nalish darajalar va amaliy progress atrofida tuzilgan, shuning uchun o'quvchilar va ota-onalar qo'shilishdan oldin akademik shaklni tushunadi."
              : "Each path is framed around levels and practical progression, so students and parents can understand the academic shape before they commit."
          }
        />
        <div className="grid gap-6 lg:grid-cols-3">
          {localizedLearningPaths.map((path) => (
            <Card key={path.name}>
              <CardContent className="space-y-6 p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <h3 className="font-display text-2xl">{path.name}</h3>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      {path.level}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="space-y-4">
                  {path.steps.map((step) => (
                    <div key={step} className="flex items-center gap-3 rounded-2xl bg-secondary/70 px-4 py-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white">
                        <Check className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm">{step}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </Section>
  );
}
