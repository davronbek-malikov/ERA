import { NextRequest } from "next/server";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { assertRateLimit, getUserRateLimitKeyParts } from "@/lib/rate-limit";
import {
  bucketForFolder,
  buildPublicObjectUrl,
  buildUserScopedStoragePath,
  STORAGE_FOLDERS,
  validateUpload
} from "@/lib/storage";
import { readJsonObject, requireString } from "@/lib/validation";
import { assertSameOrigin, requireTeacherUser, toApiErrorResponse } from "@/server/authz";
import { createSignedUploadUrl } from "@/server/storage";

function isSafeFilename(filename: string) {
  return (
    filename.length <= 180 &&
    !filename.includes("/") &&
    !filename.includes("\\") &&
    /^[\w.\-()\s]+$/u.test(filename)
  );
}

/**
 * Issues a one-time signed upload URL for teachers and admins. The object path is generated here
 * (scoped to the uploader); the client never chooses where a file lands.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const currentUser = await requireTeacherUser();
    const body = await readJsonObject(request, 4 * 1024);

    const filename = requireString(body.filename, "filename", { max: 180 });
    const contentType = requireString(body.contentType, "contentType", { max: 120 });
    const folder = requireString(body.folder, "folder", { max: 40 });
    const fileSize = body.fileSize;

    if (!STORAGE_FOLDERS[folder]) {
      return createApiErrorResponse(400, "invalid-upload-folder", "Invalid upload folder.");
    }
    if (!isSafeFilename(filename)) {
      return createApiErrorResponse(400, "invalid-filename", "Invalid filename.");
    }
    if (typeof fileSize !== "number") {
      return createApiErrorResponse(400, "invalid-file-size", "Invalid file size.");
    }
    const uploadError = validateUpload(folder, filename, contentType, fileSize);
    if (uploadError) {
      return createApiErrorResponse(400, "invalid-upload", uploadError);
    }

    await assertRateLimit({
      scope: "storage-upload",
      maxAttempts: 60,
      windowMs: 60 * 60_000,
      cooldownMs: 15 * 60_000,
      keyParts: getUserRateLimitKeyParts(currentUser.id)
    });

    const bucket = bucketForFolder(folder);
    const path = buildUserScopedStoragePath(currentUser.id, folder, filename);
    const uploadUrl = await createSignedUploadUrl(bucket, path);

    // `publicUrl` keeps its historical name and format. For private folders it is only a stable
    // reference: once the bucket is private it cannot be opened directly, and learners receive
    // signed URLs instead (see src/server/storage.ts).
    return createApiSuccessResponse({
      uploadUrl,
      publicUrl: buildPublicObjectUrl(bucket, path),
      path,
      visibility: STORAGE_FOLDERS[folder].visibility
    });
  } catch (error) {
    return toApiErrorResponse(error, {
      status: 500,
      code: "upload-prepare-failed",
      message: "Could not prepare the upload.",
      log: "storage-upload"
    });
  }
}
