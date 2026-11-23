import {
  getSupabaseStorageConfig,
  isSafeStoragePath,
  parseStorageObjectUrl,
  storagePathFolder,
  STORAGE_FOLDERS,
  bucketForFolder,
  supabaseServiceHeaders
} from "@/lib/storage";

/*
 * Server-only Supabase Storage operations (service-role key never leaves this module).
 * Errors thrown here carry no provider detail; callers log and return generic messages.
 */

export const MATERIAL_URL_TTL_SECONDS = 5 * 60;
export const VIDEO_URL_TTL_SECONDS = 4 * 60 * 60;

class StorageProviderError extends Error {
  constructor(operation: string, status: number) {
    super(`Storage ${operation} failed with status ${status}.`);
    this.name = "StorageProviderError";
  }
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function authHeaders(serviceRoleKey: string) {
  return { ...supabaseServiceHeaders(serviceRoleKey), "Content-Type": "application/json" };
}

/** One-time upload URL. Never overwrites an existing object (`x-upsert: false`). */
export async function createSignedUploadUrl(bucket: string, path: string) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseStorageConfig();
  const response = await fetch(`${supabaseUrl}/storage/v1/object/upload/sign/${bucket}/${encodePath(path)}`, {
    method: "POST",
    headers: { ...authHeaders(serviceRoleKey), "x-upsert": "false" },
    body: JSON.stringify({})
  });
  const payload = (await response.json().catch(() => null)) as { url?: string; signedURL?: string; token?: string } | null;
  if (!response.ok || !payload) throw new StorageProviderError("upload-sign", response.status);

  const signed = payload.url ?? payload.signedURL ?? `/object/upload/sign/${bucket}/${encodePath(path)}?token=${payload.token ?? ""}`;
  return signed.startsWith("http") ? signed : `${supabaseUrl}/storage/v1${signed}`;
}

/** Short-lived read URL for an object in any bucket (works for private buckets). */
export async function createSignedObjectUrl(bucket: string, path: string, expiresInSeconds: number) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseStorageConfig();
  const response = await fetch(`${supabaseUrl}/storage/v1/object/sign/${bucket}/${encodePath(path)}`, {
    method: "POST",
    headers: authHeaders(serviceRoleKey),
    body: JSON.stringify({ expiresIn: expiresInSeconds })
  });
  const payload = (await response.json().catch(() => null)) as { signedURL?: string; signedUrl?: string } | null;
  const signed = payload?.signedURL ?? payload?.signedUrl;
  if (!response.ok || !signed) throw new StorageProviderError("sign", response.status);
  return signed.startsWith("http") ? signed : `${supabaseUrl}/storage/v1${signed}`;
}

export async function deleteStorageObject(bucket: string, path: string) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseStorageConfig();
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: authHeaders(serviceRoleKey),
    body: JSON.stringify({ prefixes: [path] })
  });
  if (!response.ok) throw new StorageProviderError("delete", response.status);
}

/** The bucket a server-generated path belongs to, derived from its folder. */
export function bucketForStoragePath(path: string) {
  const folder = storagePathFolder(path);
  return folder && STORAGE_FOLDERS[folder] ? bucketForFolder(folder) : getSupabaseStorageConfig().bucket;
}

/**
 * Playback URL for a lesson video. Objects in ERA's private bucket get a signed URL valid for a few
 * hours (long enough to watch; the page re-signs on every visit). External URLs (YouTube, Vimeo, other
 * hosts) are returned unchanged. If signing fails the video is withheld rather than exposed.
 */
export async function resolvePlaybackUrl(videoUrl: string | null): Promise<string | null> {
  if (!videoUrl) return null;
  const object = parseStorageObjectUrl(videoUrl);
  if (!object) return videoUrl;
  if (object.bucket !== getSupabaseStorageConfig().bucket) return videoUrl;

  try {
    return await createSignedObjectUrl(object.bucket, object.path, VIDEO_URL_TTL_SECONDS);
  } catch (error) {
    console.error(`[storage] could not sign lesson video: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

/**
 * Where an authorized learner should be sent to download a material.
 * Stored objects → signed URL (5 minutes). External http(s) links → unchanged. Anything else → null.
 */
export async function resolveMaterialDownloadUrl(material: { fileUrl: string; storagePath: string | null }) {
  const object = parseStorageObjectUrl(material.fileUrl);
  const path = object?.path ?? (material.storagePath && isSafeStoragePath(material.storagePath) ? material.storagePath : null);

  if (path) {
    const bucket = object?.bucket ?? bucketForStoragePath(path);
    return createSignedObjectUrl(bucket, path, MATERIAL_URL_TTL_SECONDS);
  }

  try {
    const url = new URL(material.fileUrl);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
