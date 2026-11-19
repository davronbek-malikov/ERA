import type { Metadata } from "next";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { getCurrentUser } from "@/lib/auth";
import { getLocale } from "@/lib/i18n-server";
import { createMetadata } from "@/lib/site";
import { ensureOnboardingRecord, getOnboardingByUserId } from "@/server/onboarding";

export const metadata: Metadata = createMetadata({
  title: "Onboarding",
  description: "Set your ERA learning goal, take a short assessment, and get a guided starting plan.",
  path: "/onboarding"
});

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const [locale, currentUser] = await Promise.all([getLocale(), getCurrentUser()]);

  if (!currentUser) {
    redirect("/sign-in?next=/onboarding");
  }

  if (currentUser.role !== UserRole.STUDENT) {
    redirect("/admin");
  }

  await ensureOnboardingRecord(currentUser.id);
  const onboarding = await getOnboardingByUserId(currentUser.id);

  if (onboarding?.stage === "COMPLETED") {
    redirect("/my-learning?onboarding=1");
  }

  return (
    <Section className="pt-8 sm:pt-10">
      <Container className="max-w-[980px]">
        <OnboardingFlow
          locale={locale}
          userName={currentUser.name}
          defaults={{
            goal: onboarding?.goal,
            level: onboarding?.level,
            timeAvailability: onboarding?.timeAvailability
          }}
        />
      </Container>
    </Section>
  );
}
