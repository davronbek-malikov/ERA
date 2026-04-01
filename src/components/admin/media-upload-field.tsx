"use client";

import { useRef, useState } from "react";
import { ImageIcon, Loader2, Trash2, Upload, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MediaUploadFieldProps = {
  name: string;
  label: string;
  placeholder: string;
  uploadFolder: string;
  mediaType: "image" | "video" | "file";
  helperText?: string;
  initialValue?: string;
  initialStoragePath?: string;
  initialMimeType?: string;
  storagePathName?: string;
  mimeTypeName?: string;
};

const MAX_VIDEO_SIZE_BYTES = 1024 * 1024 * 500;
const MAX_IMAGE_SIZE_BYTES = 1024 * 1024 * 10;
const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 25;

function createUploadRequest(
  uploadUrl: string,
  file: File,
  onProgress: (progress: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) {
        return;
      }

      onProgress(Math.round((event.loaded / event.total) * 100));
    });

    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }

      reject(new Error(request.responseText || "The upload did not complete."));
    });

    request.addEventListener("error", () => {
      reject(new Error("The upload failed due to a network error."));
    });

    request.open("PUT", uploadUrl);
    request.setRequestHeader("Content-Type", file.type);
    request.send(file);
  });
}

export function MediaUploadField({
  name,
  label,
  placeholder,
  uploadFolder,
  mediaType,
  helperText,
  initialValue = "",
  initialStoragePath,
  initialMimeType,
  storagePathName,
  mimeTypeName
}: MediaUploadFieldProps) {
  const [value, setValue] = useState(initialValue);
  const [storagePath, setStoragePath] = useState<string | null>(initialStoragePath ?? null);
  const [mimeType, setMimeType] = useState(initialMimeType ?? "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isVideo = mediaType === "video";
  const isImage = mediaType === "image";
  const isGenericFile = mediaType === "file";
  const accept = isVideo
    ? "video/*"
    : isImage
      ? "image/*"
      : ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.zip,.rar,.7z";
  const maxSizeBytes = isVideo
    ? MAX_VIDEO_SIZE_BYTES
    : isImage
      ? MAX_IMAGE_SIZE_BYTES
      : MAX_FILE_SIZE_BYTES;
  const UploadIcon = isVideo ? Video : isImage ? ImageIcon : Upload;

  async function deleteUploadedFile(pathToDelete: string) {
    const deleteResponse = await fetch("/api/admin/storage/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        path: pathToDelete
      })
    });

    const deletePayload = (await deleteResponse.json()) as { error?: string };

    if (!deleteResponse.ok) {
      throw new Error(deletePayload.error || "Could not remove the uploaded file.");
    }
  }

  async function handleRemove() {
    setError(null);
    setMessage(null);

    try {
      if (storagePath) {
        await deleteUploadedFile(storagePath);
      } else if (value) {
        const deleteResponse = await fetch("/api/admin/storage/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            publicUrl: value
          })
        });

        const deletePayload = (await deleteResponse.json()) as { error?: string };

        if (!deleteResponse.ok && deletePayload.error !== "Missing file path.") {
          throw new Error(deletePayload.error || "Could not remove the uploaded file.");
        }
      }

      setValue("");
      setStoragePath(null);
      setMimeType("");
      setSelectedFile(null);
      setUploadProgress(0);
      setMessage("Media cleared from this form.");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove the file.");
    }
  }

  function handleSelectedFile(file: File | null) {
    setSelectedFile(file);
    setMimeType(file?.type ?? "");
    setMessage(null);
    setError(null);
  }

  async function handleUpload() {
    if (!selectedFile) {
      setError(`Choose a ${mediaType} file first.`);
      setMessage(null);
      return;
    }

    if (
      (isVideo && !selectedFile.type.startsWith("video/")) ||
      (isImage && !selectedFile.type.startsWith("image/")) ||
      (isGenericFile && !selectedFile.name.includes("."))
    ) {
      setError(`Please choose a valid ${mediaType} file.`);
      setMessage(null);
      return;
    }

    if (selectedFile.size > maxSizeBytes) {
      setError(
        isVideo
          ? "Video files must be 500 MB or smaller."
          : isImage
            ? "Image files must be 10 MB or smaller."
            : "Materials must be 25 MB or smaller."
      );
      setMessage(null);
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setError(null);
    setMessage(null);

    try {
      if (storagePath) {
        await deleteUploadedFile(storagePath);
      } else if (value) {
        const deleteResponse = await fetch("/api/admin/storage/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            publicUrl: value
          })
        });

        const deletePayload = (await deleteResponse.json()) as { error?: string };

        if (!deleteResponse.ok && deletePayload.error !== "Missing file path.") {
          throw new Error(deletePayload.error || "Could not remove the uploaded file.");
        }
      }

      const signedUploadResponse = await fetch("/api/admin/storage/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: selectedFile.type,
          folder: uploadFolder,
          fileSize: selectedFile.size
        })
      });

      const signedUploadData = (await signedUploadResponse.json()) as
        | { uploadUrl: string; publicUrl: string; path: string }
        | { error: string };

      if (!signedUploadResponse.ok || !("uploadUrl" in signedUploadData)) {
        throw new Error(
          "error" in signedUploadData ? signedUploadData.error : "Could not start the upload."
        );
      }

      await createUploadRequest(signedUploadData.uploadUrl, selectedFile, setUploadProgress);

      setValue(signedUploadData.publicUrl);
      setStoragePath(signedUploadData.path);
      setMimeType(selectedFile.type);
      setMessage(
        `${isVideo ? "Video" : isImage ? "Image" : "File"} uploaded successfully. The URL has been added to this form.`
      );
      setSelectedFile(null);
      setUploadProgress(100);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : `${mediaType} upload failed.`);
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-3 md:col-span-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <Input
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setStoragePath(null);
          setMimeType("");
          setMessage(null);
          setError(null);
        }}
      />
      {storagePathName ? <input type="hidden" name={storagePathName} value={storagePath ?? ""} /> : null}
      {mimeTypeName ? <input type="hidden" name={mimeTypeName} value={mimeType} /> : null}
      {value ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-white/80">
          {isVideo ? (
            <video controls className="max-h-72 w-full bg-black" src={value}>
              <track kind="captions" />
            </video>
          ) : isImage ? (
            // Admin previews can point at arbitrary remote storage URLs, so a plain img is safer here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={`${label} preview`} className="max-h-72 w-full object-cover" />
          ) : (
            <div className="flex items-center justify-between gap-4 p-4 text-sm">
              <span className="truncate text-muted-foreground">{value}</span>
              <a
                href={value}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-border px-4 py-2 font-medium text-foreground hover:bg-secondary"
              >
                Download
              </a>
            </div>
          )}
        </div>
      ) : null}
      <div
        className={`rounded-2xl border border-dashed px-4 py-5 transition ${
          isDragging ? "border-primary bg-primary/5" : "border-border bg-secondary/25"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleSelectedFile(event.dataTransfer.files?.[0] ?? null);
        }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <UploadIcon className="h-4 w-4" />
              {isVideo
                ? "Upload a local video"
                : isImage
                  ? "Upload a local thumbnail"
                  : "Upload a downloadable file"}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Drag and drop a file here or choose one from your device.
            </p>
            {selectedFile ? (
              <p className="text-sm text-foreground">
                Selected: <span className="font-medium">{selectedFile.name}</span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              ref={fileInputRef}
              type="file"
              accept={accept}
              onChange={(event) => handleSelectedFile(event.target.files?.[0] ?? null)}
              className="h-auto py-2"
            />
            <Button type="button" onClick={handleUpload} disabled={isUploading}>
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isUploading ? "Uploading..." : storagePath ? "Replace Upload" : "Upload File"}
            </Button>
            {(value || storagePath) ? (
              <Button type="button" variant="outline" onClick={handleRemove}>
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            ) : null}
          </div>
        </div>
        {isUploading || uploadProgress > 0 ? (
          <div className="mt-4 space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{uploadProgress}% uploaded</p>
          </div>
        ) : null}
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        {helperText ??
          `Paste an existing public ${mediaType} URL or upload a local file directly to Supabase Storage.`}
      </p>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
