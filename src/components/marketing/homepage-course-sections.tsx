import { type HomepageCourseCollection } from "@/server/courses";
import type { Locale } from "@/lib/i18n";

import { CourseCard } from "@/components/courses/course-card";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { SectionHeading } from "@/components/marketing/section-heading";

type HomepageCourseSectionsProps = {
  collections: HomepageCourseCollection[];
  locale: Locale;
};

function getCollectionCopy(key: HomepageCourseCollection["key"], locale: Locale) {
  const isUzbek = locale === "uz";

  switch (key) {
    case "continueLearning":
      return {
        eyebrow: isUzbek ? "Davom etish" : "Continue learning",
        title: isUzbek
          ? "Oxirgi progress va keyingi darslaringiz shu yerda kutmoqda."
          : "Pick up where you left off with your latest progress and next lesson.",
        description: isUzbek
          ? "Tizim sizning enrollments va oxirgi activity asosida shu bo'limni jonli yangilab turadi."
          : "This updates from your live enrollments and recent learning activity when you are signed in."
      };
    case "recommendedForYou":
      return {
        eyebrow: isUzbek ? "Siz uchun tavsiya" : "Recommended for you",
        title: isUzbek
          ? "Onboarding va o'qish odatlaringizga mos kurslar."
          : "Courses matched to your onboarding profile and learning patterns.",
        description: isUzbek
          ? "Maqsad, daraja va oldingi qiziqishlaringizdan signal olib tanlanadi."
          : "Selected using your goal, level, and the subjects you are already engaging with."
      };
    case "trendingCourses":
      return {
        eyebrow: isUzbek ? "Trend kurslar" : "Trending courses",
        title: isUzbek
          ? "Qiziqish tez o'sayotgan va momentum yig'ayotgan kurslar."
          : "Courses showing fast recent growth in interest and learner momentum.",
        description: isUzbek
          ? "Yaqin kunlardagi view growth, enrollments va activity asosida yangilanadi."
          : "Updated from recent view growth, enrollments, and engagement signals."
      };
    case "newCourses":
      return {
        eyebrow: isUzbek ? "Yangi kurslar" : "New courses",
        title: isUzbek
          ? "Yaqinda chop etilgan va ko'rishga tayyor kurslar."
          : "Recently published courses that are ready to explore.",
        description: isUzbek
          ? "Yangi kontentni tez topish uchun chop etilgan vaqt bo'yicha saralanadi."
          : "Sorted by publish date so new content is easier to discover."
      };
    default:
      return {
        eyebrow: "Courses",
        title: "Course highlights",
        description: "Dynamic homepage course recommendations."
      };
  }
}

export function HomepageCourseSections({ collections, locale }: HomepageCourseSectionsProps) {
  if (collections.length === 0) {
    return null;
  }

  return (
    <>
      {collections.map((collection) => {
        const copy = getCollectionCopy(collection.key, locale);

        if (collection.courses.length === 0) {
          return null;
        }

        return (
          <Section key={collection.key} className={collection.key === "continueLearning" ? "pt-8" : undefined}>
            <Container className="space-y-8">
              <SectionHeading
                eyebrow={copy.eyebrow}
                title={copy.title}
                description={copy.description}
              />
              <div className="grid gap-6 xl:grid-cols-3">
                {collection.courses.map((course) => (
                  <CourseCard key={`${collection.key}-${course.id}`} course={course} locale={locale} />
                ))}
              </div>
            </Container>
          </Section>
        );
      })}
    </>
  );
}
