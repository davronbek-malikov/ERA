/**
 * READ-ONLY storage privacy audit (Prompt 09 acceptance audit, docs/ERA_STORAGE_PRIVACY_PLAN.md).
 *
 * Before the private bucket (SUPABASE_STORAGE_VIDEOS_BUCKET, default "course-videos") is switched to private in
 * Supabase, every *public* asset (thumbnails, promo videos, avatars, images) must live in the public bucket instead,
 * otherwise its saved URL stops working. This script lists, from the database only, which saved URLs would break.
 * It never changes the database or storage.
 *
 *   DATABASE_URL=... SUPABASE_URL=... npx tsx scripts/storage/audit-bucket-privacy.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const privateBucket = process.env.SUPABASE_STORAGE_VIDEOS_BUCKET || "course-videos";
const publicBucket = process.env.SUPABASE_STORAGE_PUBLIC_BUCKET || privateBucket;
const privatePrefix = `${supabaseUrl}/storage/v1/object/public/${privateBucket}/`;

type Row = { field: string; id: string; url: string };

/** Public fields (shown on public pages or to everyone): these must NOT stay in the private bucket. */
async function publicAssetUrls(): Promise<Row[]> {
  const [users, instructors, subjects, courses, settings] = await Promise.all([
    prisma.user.findMany({ where: { image: { startsWith: privatePrefix } }, select: { id: true, image: true } }),
    prisma.instructor.findMany({ where: { imageUrl: { startsWith: privatePrefix } }, select: { id: true, imageUrl: true } }),
    prisma.subject.findMany({ where: { thumbnailUrl: { startsWith: privatePrefix } }, select: { id: true, thumbnailUrl: true } }),
    prisma.course.findMany({
      where: { OR: [{ thumbnailUrl: { startsWith: privatePrefix } }, { promoVideoUrl: { startsWith: privatePrefix } }] },
      select: { id: true, thumbnailUrl: true, promoVideoUrl: true }
    }),
    prisma.siteSetting.findMany({ where: { defaultPromoVideoUrl: { startsWith: privatePrefix } }, select: { id: true, defaultPromoVideoUrl: true } })
  ]);
  const rows: Row[] = [];
  for (const u of users) rows.push({ field: "User.image", id: u.id, url: u.image! });
  for (const i of instructors) rows.push({ field: "Instructor.imageUrl", id: i.id, url: i.imageUrl! });
  for (const s of subjects) rows.push({ field: "Subject.thumbnailUrl", id: s.id, url: s.thumbnailUrl! });
  for (const c of courses) {
    if (c.thumbnailUrl?.startsWith(privatePrefix)) rows.push({ field: "Course.thumbnailUrl", id: c.id, url: c.thumbnailUrl });
    if (c.promoVideoUrl?.startsWith(privatePrefix)) rows.push({ field: "Course.promoVideoUrl", id: c.id, url: c.promoVideoUrl });
  }
  for (const s of settings) rows.push({ field: "SiteSetting.defaultPromoVideoUrl", id: s.id, url: s.defaultPromoVideoUrl! });
  return rows;
}

async function main() {
  if (!supabaseUrl) {
    console.error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) to the project's URL.");
    process.exit(1);
  }
  const mustMove = await publicAssetUrls();
  const [lessonVideos, materials, knowledge] = await Promise.all([
    prisma.lesson.count({ where: { videoUrl: { startsWith: privatePrefix } } }),
    prisma.courseMaterial.count({ where: { fileUrl: { startsWith: privatePrefix } } }),
    prisma.knowledgeDocument.count()
  ]);

  console.log(`Private bucket: ${privateBucket}   Public bucket: ${publicBucket}${publicBucket === privateBucket ? "  (NOT CONFIGURED — same bucket)" : ""}\n`);
  console.log("Already safe after the switch (served through signed URLs or server downloads):");
  console.log(`  lesson videos in the private bucket: ${lessonVideos}`);
  console.log(`  course materials in the private bucket: ${materials}`);
  console.log(`  knowledge base documents: ${knowledge}\n`);
  console.log(`Public assets that would BREAK if the private bucket were made private now: ${mustMove.length}`);
  for (const row of mustMove) console.log(`  ${row.field.padEnd(32)} ${row.id}  ${row.url.slice(privatePrefix.length)}`);
  console.log(mustMove.length === 0 && publicBucket !== privateBucket ? "\nResult: safe to make the private bucket private." : "\nResult: NOT yet safe — see docs/ERA_STORAGE_PRIVACY_PLAN.md.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
