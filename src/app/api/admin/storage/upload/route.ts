import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { getCurrentUser } from "@/lib/auth";
import { buildUserScopedStoragePath, getSupabaseStorageConfig } from "@/lib/storage";
import { retryOnDatabaseFailure } from "@/lib/server-data";

const allowedUploadFolders = new Set([
  "course-materials",
  "course-promo-videos",
  "course-thumbnails",
  "images",
  "lesson-materials",
  "lesson-videos",
  "subject-thumbnails"
]);

const maxUploadSizeByFolder: Record<string, number> = {
  "course-materials": 25 * 1024 * 1024,
  "course-promo-videos": 500 * 1024 * 1024,
  "course-thumbnails": 10 * 1024 * 1024,
  images: 10 * 1024 * 1024,
  "lesson-materials": 25 * 1024 * 1024,
  "lesson-videos": 500 * 1024 * 1024,
  "subject-thumbnails": 10 * 1024 * 1024
};

function isAllowedUploadType(contentType: string) {
  return (
    contentType.startsWith("video/") ||
    contentType.startsWith("image/") ||
    contentType === "application/pdf" ||
    contentType === "application/zip" ||
    contentType === "application/x-zip-compressed" ||
    contentType === "application/vnd.rar" ||
    contentType === "application/x-7z-compressed" ||
    contentType === "text/plain" ||
    contentType === "text/csv" ||
    contentType === "application/msword" ||
    contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    contentType === "application/vnd.ms-powerpoint" ||
    contentType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    contentType === "application/vnd.ms-excel" ||
    contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

function isSafeFilename(filename: string) {
  return (
    filename.length <= 180 &&
    !filename.includes("/") &&
    !filename.includes("\\") &&
    /^[\w.\-()\s]+$/u.test(filename)
  );
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (
    !currentUser ||
    (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.INSTRUCTOR)
  ) {
    return createApiErrorResponse(401, "unauthorized", "Unauthorized.");
  }

  try {
    const { filename, contentType, folder, fileSize } = (await request.json()) as {
      filename?: string;
      contentType?: string;
      folder?: string;
      fileSize?: number;
    };

    if (!filename || !contentType || !folder || typeof fileSize !== "number") {
      return createApiErrorResponse(400, "missing-upload-parameters", "Missing upload parameters.");
    }

    if (!allowedUploadFolders.has(folder)) {
      return createApiErrorResponse(400, "invalid-upload-folder", "Invalid upload folder.");
    }

    if (!isSafeFilename(filename)) {
      return createApiErrorResponse(400, "invalid-filename", "Invalid filename.");
    }

    if (!isAllowedUploadType(contentType)) {
      return createApiErrorResponse(
        400,
        "invalid-upload-type",
        "Only image, video, and common document uploads are allowed."
      );
    }

    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return createApiErrorResponse(400, "invalid-file-size", "Invalid file size.");
    }

    const maxSizeBytes = maxUploadSizeByFolder[folder] ?? 25 * 1024 * 1024;
    if (fileSize > maxSizeBytes) {
      return createApiErrorResponse(400, "file-too-large", "The selected file exceeds the size limit.");
    }

    const { supabaseUrl, serviceRoleKey, bucket } = getSupabaseStorageConfig();
    const path = buildUserScopedStoragePath(currentUser.id, folder, filename);
    const signResponse = await retryOnDatabaseFailure(() =>
      fetch(`${supabaseUrl}/storage/v1/object/upload/sign/${bucket}/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          upsert: true
        })
      })
    );

    const signPayload = await signResponse.json();

    if (!signResponse.ok) {
      const errorMessage =
        typeof signPayload?.message === "string"
          ? signPayload.message
          : "Could not create a Supabase upload URL.";
      return createApiErrorResponse(500, "upload-url-failed", errorMessage);
    }

    const signedPath =
      typeof signPayload?.signedURL === "string"
        ? signPayload.signedURL
        : `/object/upload/sign/${bucket}/${path}?token=${signPayload?.token ?? ""}`;

    const uploadUrl = signedPath.startsWith("http")
      ? signedPath
      : `${supabaseUrl}/storage/v1${signedPath}`;

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;

    return createApiSuccessResponse({
      uploadUrl,
      publicUrl,
      path
    });
  } catch (error) {
    return createApiErrorResponse(
      500,
      "upload-prepare-failed",
      error instanceof Error ? error.message : "Could not prepare the upload."
    );
  }
}
