import type { MetadataRoute } from "next";
import { PublicationStatus } from "@prisma/client";

import { isDatabaseOfflineError } from "@/lib/server-data";
import { siteConfig } from "@/lib/site";
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [subjects, courses] = await Promise.all([
    prisma.subject.findMany({
      where: { status: PublicationStatus.PUBLISHED },
      select: { slug: true, updatedAt: true }
    }),
    prisma.course.findMany({
      where: { status: PublicationStatus.PUBLISHED },
      select: { slug: true, updatedAt: true }
    })
  ]).catch((error) => {
    if (!isDatabaseOfflineError(error)) {
      throw error;
    }

    // List static pages only while the database is unreachable.
    return [[], []] as const;
  });

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: siteConfig.url,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: `${siteConfig.url}/subjects`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9
    },
    {
      url: `${siteConfig.url}/courses`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9
    },
    {
      url: `${siteConfig.url}/learning-paths`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9
    }
  ];

  return [
    ...staticRoutes,
    ...subjects.map((subject) => ({
      url: `${siteConfig.url}/subjects/${subject.slug}`,
      lastModified: subject.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8
    })),
    ...courses.map((course) => ({
      url: `${siteConfig.url}/courses/${course.slug}`,
      lastModified: course.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8
    }))
  ];
}
