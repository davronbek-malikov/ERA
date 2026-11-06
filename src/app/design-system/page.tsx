import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DesignSystemPreview } from "@/app/design-system/preview";

export const metadata: Metadata = {
  title: "Design system preview",
  robots: { index: false, follow: false }
};

// Development tool for checking ERA components without a database. It is not a product
// page and returns 404 in production builds.
// ?locale=uz renders the Uzbek copy, for checking long labels.
export default async function DesignSystemPage({ searchParams }: { searchParams: Promise<{ locale?: string }> }) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { locale } = await searchParams;
  return <DesignSystemPreview locale={locale === "uz" ? "uz" : "en"} />;
}
