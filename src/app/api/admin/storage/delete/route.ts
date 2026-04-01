import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { getCurrentUser } from "@/lib/auth";
import {
  extractStoragePathFromPublicUrl,
  getSupabaseStorageConfig,
  getUserStoragePrefix
} from "@/lib/storage";
import { retryOnDatabaseFailure } from "@/lib/server-data";

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (
    !currentUser ||
    (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.INSTRUCTOR)
  ) {
    return createApiErrorResponse(401, "unauthorized", "Unauthorized.");
  }

  try {
    const { path, publicUrl } = (await request.json()) as { path?: string; publicUrl?: string };
    const normalizedPath = path || (publicUrl ? extractStoragePathFromPublicUrl(publicUrl) : null);

    if (!normalizedPath) {
      return createApiErrorResponse(400, "missing-file-path", "Missing file path.");
    }

    if (
      currentUser.role === UserRole.INSTRUCTOR &&
      !normalizedPath.startsWith(getUserStoragePrefix(currentUser.id))
    ) {
      return createApiErrorResponse(403, "forbidden", "You can only delete your own uploads.");
    }

    const { supabaseUrl, serviceRoleKey, bucket } = getSupabaseStorageConfig();
    const deleteResponse = await retryOnDatabaseFailure(() =>
      fetch(`${supabaseUrl}/storage/v1/object/${bucket}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prefixes: [normalizedPath]
        })
      })
    );

    const deletePayload = await deleteResponse.json().catch(() => null);

    if (!deleteResponse.ok) {
      const errorMessage =
        typeof deletePayload?.message === "string"
          ? deletePayload.message
          : "Could not delete the uploaded file.";
      return createApiErrorResponse(500, "delete-failed", errorMessage);
    }

    return createApiSuccessResponse({ success: true });
  } catch (error) {
    return createApiErrorResponse(
      500,
      "delete-failed",
      error instanceof Error ? error.message : "Could not delete the uploaded file."
    );
  }
}
