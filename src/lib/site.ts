import type { Metadata } from "next";

const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
const vercelUrl =
  process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const fallbackProductionUrl = "https://era-academy.vercel.app";
const safeConfiguredUrl =
  configuredUrl && !configuredUrl.includes("localhost") ? configuredUrl : undefined;

export const siteConfig = {
  name: "ERA Academy",
  shortName: "ERA",
  description:
    "Premium online academy for structured learning in AI, mathematics, English, and exam preparation.",
  url: safeConfiguredUrl || (vercelUrl ? `https://${vercelUrl}` : fallbackProductionUrl),
  ogImage: "/opengraph-image"
};

export function absoluteUrl(path = "") {
  return `${siteConfig.url}${path}`;
}

export function createMetadata({
  title,
  description,
  path = "",
  images
}: {
  title: string;
  description: string;
  path?: string;
  images?: string[];
}): Metadata {
  const fullTitle = title === siteConfig.name ? title : `${title} | ${siteConfig.name}`;
  const pageUrl = absoluteUrl(path);
  const ogImages = (images && images.length > 0 ? images : [siteConfig.ogImage]).map((image) =>
    image.startsWith("http") ? image : absoluteUrl(image)
  );

  return {
    title,
    description,
    alternates: {
      canonical: pageUrl
    },
    openGraph: {
      title: fullTitle,
      description,
      url: pageUrl,
      siteName: siteConfig.name,
      type: "website",
      images: ogImages.map((url) => ({
        url,
        width: 1200,
        height: 630,
        alt: fullTitle
      }))
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: ogImages
    }
  };
}
