import { randomUUID } from "crypto";

import { slugify } from "@/lib/slugs";

export function getSupabaseStorageConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_VIDEOS_BUCKET || "course-videos";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase Storage is not configured on the server.");
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    bucket
  };
}

export function buildStoragePath(folder: string, filename: string) {
  const extension = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() : "bin";
  const safeName = slugify(filename.replace(/\.[^.]+$/, "")) || "file";
  const safeFolder = slugify(folder) || "uploads";
  const monthKey = new Date().toISOString().slice(0, 7);

  return `${safeFolder}/${monthKey}/${randomUUID()}-${safeName}.${extension}`;
}

export function buildUserScopedStoragePath(userId: string, folder: string, filename: string) {
  const basePath = buildStoragePath(folder, filename);
  const safeUserId = slugify(userId) || userId;

  return `users/${safeUserId}/${basePath}`;
}

export function getUserStoragePrefix(userId: string) {
  const safeUserId = slugify(userId) || userId;
  return `users/${safeUserId}/`;
}

export function getSupabasePublicObjectPrefix() {
  const { supabaseUrl, bucket } = getSupabaseStorageConfig();
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/`;
}

export function extractStoragePathFromPublicUrl(publicUrl: string) {
  const publicPrefix = getSupabasePublicObjectPrefix();

  if (!publicUrl.startsWith(publicPrefix)) {
    return null;
  }

  return publicUrl.slice(publicPrefix.length);
}
