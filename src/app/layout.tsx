import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";

import "@/app/globals.css";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { getLocale } from "@/lib/i18n-server";
import { siteConfig } from "@/lib/site";
import { Toaster } from "@/components/ui/toast";

// One family for headings and body. Inter covers Latin (including Uzbek Latin)
// and Cyrillic, so English, Uzbek and Russian text all render in the same font.
const sans = Inter({
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  variable: "--font-sans",
  weight: ["400", "500", "600"],
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`
  },
  description: siteConfig.description,
  alternates: {
    canonical: siteConfig.url
  },
  applicationName: siteConfig.name,
  icons: {
    icon: "/icon.svg"
  },
  keywords: [
    "online academy",
    "AI courses for students",
    "mathematics tutoring online",
    "English learning courses",
    "exam preparation platform",
    "structured learning paths"
  ],
  authors: [{ name: siteConfig.name }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  formatDetection: {
    email: false,
    address: false,
    telephone: false
  },
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    siteName: siteConfig.name,
    url: siteConfig.url,
    type: "website",
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: siteConfig.name
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    images: [siteConfig.ogImage]
  }
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body className={sans.variable}>
        <LocaleProvider locale={locale}>
          <div className="relative min-h-screen">{children}</div>
        </LocaleProvider>
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
