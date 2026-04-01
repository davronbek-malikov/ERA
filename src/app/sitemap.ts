import type { MetadataRoute } from "next";
import { PublicationStatus } from "@prisma/client";

import { demoCourses, demoSubjects } from "@/lib/demo-data";
import { withDatabaseFallback } from "@/lib/server-data";
import { siteConfig } from "@/lib/site";
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [subjects, courses] = await withDatabaseFallback(
    async () => [
      await prisma.subject.findMany({
        where: { status: PublicationStatus.PUBLISHED },
        select: { slug: true, updatedAt: true }
      }),
      await prisma.course.findMany({
        where: { status: PublicationStatus.PUBLISHED },
        select: { slug: true, updatedAt: true }
      })
    ],
    () =>
      [
        demoSubjects.map((subject) => ({
          slug: subject.slug,
          updatedAt: subject.updatedAt
        })),
        demoCourses.map((course) => ({
          slug: course.slug,
          updatedAt: course.updatedAt
        }))
      ] as const
  );

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
