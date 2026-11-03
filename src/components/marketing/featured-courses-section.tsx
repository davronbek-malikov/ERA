import { Clock3, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { CourseDifficulty } from "@prisma/client";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDifficulty, formatDurationSummary, formatLessonSummary } from "@/lib/format";
import { getMessages, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type FeaturedCoursesSectionProps = {
  locale: Locale;
  featuredCourses: Array<{
    slug: string;
    title: string;
    shortDescription: string | null;
    difficulty: CourseDifficulty;
    category: {
      name: string;
      subject: {
        name: string;
      };
    };
    _count: {
      lessons: number;
    };
    durationMinutes: number;
  }>;
};

export function FeaturedCoursesSection({
  locale,
  featuredCourses
}: FeaturedCoursesSectionProps) {
  const t = getMessages(locale);
  return (
    <Section>
      <Container className="space-y-10">
        <SectionHeading
          eyebrow={locale === "uz" ? "Tavsiya etilgan kurslar" : "Featured Courses"}
          title={
            locale === "uz"
              ? "Daraja, yo'nalish va akademik maqsadni aniq ko'rsatadigan kurslardan boshlang."
              : "Start with courses that already communicate level, focus, and academic direction."
          }
          description={
            locale === "uz"
              ? "Bosh sahifadagi asosiy kurslar endi haqiqiy darslarga ega kurslarni ustun qo'yadi, shunda oilalar avval tugallanmagan katalog elementlariga tushib qolmaydi."
              : "Homepage highlights now prioritize real, lesson-backed courses so families do not land on unfinished catalog entries first."
          }
        />
        <div className="grid gap-6 lg:grid-cols-3">
          {featuredCourses.map((course, index) => (
            <Card
              key={course.title}
              className="group overflow-hidden border-border/70 bg-white transition duration-300 hover:-translate-y-1 hover:border-primary/15 hover:shadow-panel"
            >
              <div className="h-2 bg-[linear-gradient(90deg,#4f46e5,#6366f1,#a5b4fc)]" />
              <CardHeader className="space-y-4 p-7">
                <div className="flex items-center justify-between gap-4">
                  <Badge variant="secondary" className="bg-accent text-accent-foreground">
                    {course.category.subject.name} {locale === "uz" ? "yo'nalishi" : "Track"} {index + 1}
                  </Badge>
                  <div className="rounded-full bg-amber-50 p-2 text-amber-500">
                    <Star className="h-4 w-4" />
                  </div>
                </div>
                <CardTitle className="break-words text-2xl font-semibold leading-tight sm:text-3xl">
                  {course.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 px-7 pb-7">
                <p className="text-sm leading-7 text-muted-foreground">
                  {course.shortDescription ??
                    (locale === "uz"
                      ? "O'quvchilarni umumiy tushunchadan ishonchli amaliyotga olib chiqish uchun yaratilgan yo'naltirilgan kurs."
                      : "A focused course designed to move students from overview to confident execution.")}
                </p>
                <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                  <div className="rounded-2xl bg-secondary/55 px-3 py-3">
                    <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4" />
                    {formatLessonSummary(course._count.lessons, locale)}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-secondary/55 px-3 py-3">
                    {formatDurationSummary(course.durationMinutes, locale)}
                  </div>
                  <div className="rounded-2xl bg-secondary/55 px-3 py-3">
                    {formatDifficulty(course.difficulty, locale)}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex-col items-stretch gap-3 px-7 pb-7 sm:flex-row sm:items-center sm:justify-between">
                <span className="break-words text-sm font-medium text-muted-foreground">{course.category.name}</span>
                <Link
                  href={`/courses/${course.slug}`}
                  className={cn(buttonVariants({ variant: "ghost" }), "justify-start px-0 sm:justify-center")}
                >
                  {t.home.viewCourse}
                  <Sparkles className="h-4 w-4" />
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      </Container>
    </Section>
  );
}
