import type { Metadata } from "next";
import Script from "next/script";

import { FaqPreviewSection } from "@/components/marketing/faq-preview-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { HeroSection } from "@/components/marketing/hero-section";
import { HomepageCourseSections } from "@/components/marketing/homepage-course-sections";
import { ProofSection } from "@/components/marketing/proof-section";
import { SubjectCardsSection } from "@/components/marketing/subject-cards-section";
import { getLocale } from "@/lib/i18n-server";
import { createMetadata } from "@/lib/site";
import { getHomepageData } from "@/server/courses";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createMetadata({
  title: "AI Learning, Math, English & Exam Prep",
  description:
    "ERA Academy offers premium online learning in AI, mathematics, English, and exam preparation with structured pathways for students, parents, and serious self-learners.",
  path: "/"
});

export default async function HomePage() {
  const locale = await getLocale();
  const homepageData = await getHomepageData();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: "ERA Academy",
    url: "https://era-academy.vercel.app",
    description:
      "Premium online academy for structured learning in AI, mathematics, English, and exam preparation.",
    educationalCredentialAwarded: "Course completion",
    knowsAbout: ["Artificial Intelligence", "Mathematics", "English", "Exam Preparation"],
    audience: ["Students", "Parents", "Self-learners"]
  };

  return (
    <>
      <Script
        id="era-academy-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <HeroSection locale={locale} stats={homepageData.stats} />
      <HomepageCourseSections locale={locale} collections={homepageData.collections} />
      <SubjectCardsSection locale={locale} subjects={homepageData.subjects} />
      <ProofSection
        locale={locale}
        instructors={homepageData.instructors}
        supportEmail={homepageData.settings?.supportEmail}
      />
      <FaqPreviewSection locale={locale} />
      <FinalCtaSection locale={locale} />
    </>
  );
}
