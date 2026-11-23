# Making the `course-videos` bucket private safely (Prompt 09 acceptance audit)

**Audience:** whoever operates ERA's Supabase project.

**Status:** not done. This is an operational change in the Supabase dashboard; no code change is needed. Nothing in
production storage was changed during the audit.

## 1. Why it matters

Until the bucket is private, anyone who learns a file's permanent link can open:
- lesson videos;
- course materials;
- Knowledge Base documents (answer keys included).

ERA no longer *shows* those links anywhere (Prompts 07 and 09), but a link that was copied before still works.

## 2. What already works with a private bucket (verified in code and tests)

| Content | How ERA serves it | Private-bucket ready |
|---|---|---|
| Lesson videos | `resolvePlaybackUrl`: a signed URL valid for 4 hours, created after the classroom checks access | Yes |
| Course and lesson materials | `/api/materials/[id]/download`: checks access, then redirects to a signed URL valid for 5 minutes | Yes |
| Knowledge Base files | The server downloads them with the service key (`/object/authenticated/...`); never linked | Yes |
| Uploads (all folders) | One-time signed upload URLs | Yes |

## 3. What would break today

These are public assets, uploaded **before** a separate public bucket was configured, so their saved URLs point at
`course-videos`:
- course thumbnails and promo videos;
- subject thumbnails;
- teacher photos and user avatars;
- the default promo video in site settings.

If the bucket were made private now, these images and videos would stop loading on the public pages.

## 4. Safe procedure (staging first, then production)

1. **Measure.** Run the read-only audit against the target database:
   ```bash
   DATABASE_URL=<direct connection> SUPABASE_URL=<project url> SUPABASE_STORAGE_VIDEOS_BUCKET=course-videos \
     SUPABASE_STORAGE_PUBLIC_BUCKET=public-assets npx tsx scripts/storage/audit-bucket-privacy.ts
   ```
   It lists every saved URL that would break. It changes nothing.
2. **Create the public bucket.** In Supabase Storage, create `public-assets` as a **Public** bucket, with the same
   file-size and MIME restrictions you use today.
3. **Configure the app.** Set `SUPABASE_STORAGE_PUBLIC_BUCKET=public-assets` and redeploy. From now on, new
   thumbnails, promo videos and images go to the public bucket.
4. **Move existing public assets** (only those the audit lists):
   1. For each object, copy it from `course-videos/<path>` to `public-assets/<same path>`. Use the Supabase dashboard,
      or the Storage API `POST /storage/v1/object/copy` with
      `{ bucketId, sourceKey, destinationBucket, destinationKey }`.
   2. Update the saved URL in the field the audit printed: replace `/object/public/course-videos/` with
      `/object/public/public-assets/`. You can also re-upload the image in the admin course or subject editor, which
      stores the new URL automatically.
   3. Re-run the audit until it reports **0** public assets that would break.
5. **Check public pages:** the catalogue, course pages (thumbnail and promo video), subjects, and teacher photos.
6. **Switch `course-videos` to Private** in Supabase (Storage → bucket → Edit → toggle off "Public bucket").
7. **Verify:**
   - A permanent `/object/public/course-videos/...` link now fails.
   - An enrolled student can still play a lesson video and download a material.
   - The catalogue still shows thumbnails.
   - Knowledge Base upload, processing and retrieval still work.
8. **Rollback:** toggle the bucket back to Public. No code or data change is needed.

Do this on a staging project first, then production, with a database backup taken beforehand.

## 5. Notes

- The copy in step 4 keeps the original object, so a mistake can be undone. Delete the originals only after step 7.
- Supabase may cache public objects at its CDN for a short time after the switch. Test with a new URL or wait.
