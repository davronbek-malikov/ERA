import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { getUserStoragePrefix, isSafeStoragePath, parseStorageObjectUrl } from "@/lib/storage";
import { readJsonObject } from "@/lib/validation";
import { assertSameOrigin, requireTeacherUser, toApiErrorResponse } from "@/server/authz";
import { bucketForStoragePath, deleteStorageObject } from "@/server/storage";

/**
 * Deletes an uploaded object. Instructors may delete only objects under their own prefix; admins may
 * delete any server-generated upload path. Paths are validated so traversal or arbitrary keys are refused.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const currentUser = await requireTeacherUser();
    const body = await readJsonObject(request, 4 * 1024);

    const fromUrl = typeof body.publicUrl === "string" ? parseStorageObjectUrl(body.publicUrl) : null;
    const path = typeof body.path === "string" && body.path ? body.path : fromUrl?.path ?? null;

    if (!path) {
      return createApiErrorResponse(400, "missing-file-path", "Missing file path.");
    }
    if (!isSafeStoragePath(path)) {
      return createApiErrorResponse(400, "invalid-file-path", "Invalid file path.");
    }
    if (currentUser.role !== UserRole.ADMIN && !path.startsWith(getUserStoragePrefix(currentUser.id))) {
      return createApiErrorResponse(403, "forbidden", "You can only delete your own uploads.");
    }

    await deleteStorageObject(fromUrl?.bucket ?? bucketForStoragePath(path), path);
    return createApiSuccessResponse({ success: true });
  } catch (error) {
    return toApiErrorResponse(error, {
      status: 500,
      code: "delete-failed",
      message: "Could not delete the uploaded file.",
      log: "storage-delete"
    });
  }
}
