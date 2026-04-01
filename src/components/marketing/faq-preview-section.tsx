import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Card, CardContent } from "@/components/ui/card";
import { type Locale } from "@/lib/i18n";

export function FaqPreviewSection({ locale }: { locale: Locale }) {
  const faqs =
    locale === "uz"
      ? [
          {
            question: "ERA Academy kimlar uchun mo'ljallangan?",
            answer:
              "ERA Academy maktab o'quvchilari, imtihonga yo'naltirilganlar, ko'proq ochiqlik xohlaydigan oilalar va tasodifiy kontent o'rniga tartibli progressni afzal ko'radigan mustaqil o'rganuvchilar uchun yaratilmoqda."
          },
          {
            question: "Ota-onalar kurs mos kelishini qanday baholashi mumkin?",
            answer:
              "Endi ommaviy kurs sahifalarida daraja, darslar soni, taxminiy o'qish vaqti, natijalar va instruktor tafsilotlari ko'rsatiladi, shuning uchun oilalar moslikni tezroq baholay oladi."
          },
          {
            question: "Bu bepul video kontentdan nimasi bilan farq qiladi?",
            answer:
              "ERA Academy ketma-ketlik, aniqlik va ishonch atrofida qurilmoqda. O'quvchilar bir videodan boshqasiga o'tib yurish o'rniga, aniqroq yo'l va kuchliroq kontekst bilan davom etadi."
          },
          {
            question: "Enrollment kengayishidan oldin ota-onalar nimani kutishi kerak?",
            answer:
              "Platforma hozir avvalo kurs tuzilmasining shaffofligini ko'rsatadi. Enrollment workflowlari rivojlanar ekan, ommaviy qism allaqachon fan yo'nalishi, natijalar va yordam kutishlarini ravshan tushuntirishga tayyor."
          }
        ]
      : [
          {
            question: "Who is ERA Academy designed for?",
            answer:
              "ERA Academy is positioned for school students, exam-focused learners, families who want more visibility, and self-learners who prefer structured progression over random content."
          },
          {
            question: "How can parents judge whether a course is appropriate?",
            answer:
              "Public course pages now show level, lesson count, estimated study time, outcomes, and instructor details so families can judge fit more quickly."
          },
          {
            question: "What makes this different from free video content?",
            answer:
              "ERA Academy is being shaped around sequence, clarity, and trust. Instead of searching from video to video, students can follow a cleaner path with better context and stronger expectations."
          },
          {
            question: "What should a parent expect before enrollment expands?",
            answer:
              "The platform now emphasizes transparent course structure first. As enrollment workflows mature, the public side is already set up to communicate subject direction, outcomes, and support expectations clearly."
          }
        ];
  return (
    <Section id="faq">
      <Container className="space-y-10">
        <SectionHeading
          eyebrow="FAQ"
          title={
            locale === "uz"
              ? "O'quvchilar va ota-onalar haqiqatan beradigan savollarga javob bering."
              : "Answer the questions students and parents actually ask."
          }
          description={
            locale === "uz"
              ? "FAQ endi ichki platforma sozlamalari haqida emas, balki ishonch va konversiyani qo'llab-quvvatlaydi."
              : "The FAQ now supports trust and conversion instead of talking about internal platform setup."
          }
        />
        <div className="space-y-4">
          {faqs.map((item) => (
            <Card key={item.question}>
              <CardContent className="space-y-3 p-6">
                <p className="text-base font-medium sm:text-lg">{item.question}</p>
                <p className="text-sm leading-7 text-muted-foreground">{item.answer}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </Section>
  );
}
