"use client";

import * as React from "react";
import { RotateCcw, Trash2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Alert, Progress } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { formatShortDate } from "@/lib/format";

/*
 * Knowledge Base manager (Prompt 09), shared by /admin/knowledge and /teacher/knowledge. Uploads go to private storage
 * (signed upload), then are registered and processed in the background. The server decides every permission; this
 * screen only offers the choices the role has.
 */

type Scope = "PLATFORM" | "COURSE" | "LESSON" | "TEACHER_PRIVATE";
type Status = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

type KnowledgeDocumentRow = {
  id: string;
  title: string;
  originalFilename: string;
  fileType: string;
  fileSize: number;
  scope: Scope;
  visibility: "STUDENTS" | "TEACHERS_ONLY";
  status: Status;
  errorMessage: string | null;
  pageCount: number | null;
  chunkCount: number;
  createdAt: string;
  uploadedBy: { name: string };
  course: { title: string } | null;
  lesson: { title: string } | null;
};

type CourseOption = { id: string; title: string; lessons: Array<{ id: string; title: string }> };

type KnowledgeManagerProps = {
  role: "admin" | "teacher";
  courses: CourseOption[];
  /** Server-side Knowledge Base configuration state, shown as a notice when retrieval is not set up. */
  embeddingConfigured: boolean;
};

const ACCEPT = ".pdf,.docx,.txt,.md,.markdown";
const SCOPE_LABEL: Record<Scope, string> = {
  PLATFORM: "Platform-wide",
  COURSE: "Course",
  LESSON: "Lesson",
  TEACHER_PRIVATE: "Private (only me)"
};
const STATUS: Record<Status, { label: string; variant: "neutral" | "primary" | "success" | "error" }> = {
  PENDING: { label: "Waiting", variant: "neutral" },
  PROCESSING: { label: "Processing", variant: "primary" },
  COMPLETED: { label: "Ready", variant: "success" },
  FAILED: { label: "Failed", variant: "error" }
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function mimeFor(file: File) {
  if (file.type) return file.type;
  if (/\.(md|markdown)$/i.test(file.name)) return "text/markdown";
  if (/\.txt$/i.test(file.name)) return "text/plain";
  return "";
}

async function json<T>(response: Response) {
  const payload = (await response.json().catch(() => null)) as ({ ok?: boolean; error?: string } & T) | null;
  if (!response.ok || !payload || payload.ok === false) throw new Error(payload?.error ?? "Something went wrong. Please try again.");
  return payload;
}

export function KnowledgeManager({ role, courses, embeddingConfigured }: KnowledgeManagerProps) {
  const scopes: Scope[] = role === "admin" ? ["PLATFORM", "COURSE", "LESSON"] : ["COURSE", "LESSON", "TEACHER_PRIVATE"];
  const [documents, setDocuments] = React.useState<KnowledgeDocumentRow[]>([]);
  const [loadState, setLoadState] = React.useState<"loading" | "ready" | "error">("loading");
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState("");
  const [scope, setScope] = React.useState<Scope>(scopes[0]);
  const [courseId, setCourseId] = React.useState(courses[0]?.id ?? "");
  const [lessonId, setLessonId] = React.useState("");
  const [teachersOnly, setTeachersOnly] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const lessons = courses.find((course) => course.id === courseId)?.lessons ?? [];

  const load = React.useCallback(async () => {
    try {
      const payload = await json<{ documents: KnowledgeDocumentRow[] }>(await fetch("/api/knowledge/documents", { cache: "no-store" }));
      setDocuments(payload.documents);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // While anything is waiting or processing, refresh its status every few seconds.
  const busy = documents.some((document) => document.status === "PENDING" || document.status === "PROCESSING");
  React.useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [busy, load]);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!file) return setFormError("Choose a file to upload.");
    if ((scope === "COURSE" || scope === "LESSON") && !courseId) return setFormError("Choose a course.");
    if (scope === "LESSON" && !lessonId) return setFormError("Choose a lesson.");

    try {
      setProgress(5);
      const mimeType = mimeFor(file);
      const signed = await json<{ uploadUrl: string; path: string }>(
        await fetch("/api/admin/storage/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: mimeType || "application/octet-stream", folder: "knowledge-documents", fileSize: file.size })
        })
      );
      setProgress(25);
      const put = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType || "application/octet-stream" }, body: file });
      if (!put.ok) throw new Error("The upload didn't complete. Please try again.");
      setProgress(70);
      await json(
        await fetch("/api/knowledge/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storagePath: signed.path,
            filename: file.name,
            mimeType,
            fileSize: file.size,
            title: title.trim() || undefined,
            scope,
            visibility: scope === "TEACHER_PRIVATE" || teachersOnly ? "TEACHERS_ONLY" : "STUDENTS",
            ...(scope === "COURSE" || scope === "LESSON" ? { courseId } : {}),
            ...(scope === "LESSON" ? { lessonId } : {})
          })
        })
      );
      setProgress(100);
      toast({ title: "Document added", description: "It's being processed. It becomes searchable when it shows Ready." });
      setFile(null);
      setTitle("");
      if (fileInput.current) fileInput.current.value = "";
      await load();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The document couldn't be added.");
    } finally {
      setProgress(null);
    }
  }

  async function remove(document: KnowledgeDocumentRow) {
    try {
      await json(await fetch(`/api/knowledge/documents/${document.id}`, { method: "DELETE" }));
      toast({ title: "Document deleted" });
      await load();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "The document couldn't be deleted.", variant: "error" });
    }
  }

  async function retry(document: KnowledgeDocumentRow) {
    try {
      await json(await fetch(`/api/knowledge/documents/${document.id}/reprocess`, { method: "POST" }));
      await load();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "The document couldn't be processed again.", variant: "error" });
    }
  }

  const canChange = (document: KnowledgeDocumentRow) => role === "admin" || document.scope !== "PLATFORM";

  const columns: DataTableColumn<KnowledgeDocumentRow>[] = [
    {
      key: "title",
      header: "Document",
      mobile: "title",
      cell: (document) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{document.title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {document.originalFilename} · {formatSize(document.fileSize)}
          </span>
        </div>
      )
    },
    {
      key: "scope",
      header: "Used for",
      mobile: "detail",
      cell: (document) => (
        <div className="flex flex-col text-sm">
          <span>
            {SCOPE_LABEL[document.scope]}
            {document.lesson ? `: ${document.lesson.title}` : document.course ? `: ${document.course.title}` : ""}
          </span>
          <span className="text-xs text-muted-foreground">{document.visibility === "TEACHERS_ONLY" ? "Teachers only" : "Students can get answers from it"}</span>
        </div>
      )
    },
    {
      key: "status",
      header: "Status",
      mobile: "detail",
      cell: (document) => (
        <div className="flex flex-col gap-1">
          <Badge variant={STATUS[document.status].variant} className="w-fit">
            {STATUS[document.status].label}
          </Badge>
          {document.status === "COMPLETED" ? (
            <span className="text-xs text-muted-foreground">
              {document.chunkCount} {document.chunkCount === 1 ? "passage" : "passages"}
              {document.pageCount ? ` · ${document.pageCount} ${document.pageCount === 1 ? "page" : "pages"}` : ""}
            </span>
          ) : null}
          {document.status === "FAILED" && document.errorMessage ? <span className="text-xs text-error">{document.errorMessage}</span> : null}
        </div>
      )
    },
    {
      key: "uploaded",
      header: "Added",
      mobile: "hidden",
      cell: (document) => (
        <span className="text-sm text-muted-foreground">
          {formatShortDate(document.createdAt)} · {document.uploadedBy.name}
        </span>
      )
    }
  ];

  return (
    <div className="flex flex-col gap-6">
      {!embeddingConfigured ? (
        <Alert variant="warning" title="Knowledge Base search isn't configured yet">
          Documents can be uploaded, but they won&apos;t be processed until an embedding provider is set on the server (see the
          Knowledge Base setup guide).
        </Alert>
      ) : null}

      <form onSubmit={upload} className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2" aria-label="Add a document">
        <Field id="kb-file" label="Document" hint="PDF, DOCX, TXT or Markdown, up to 20 MB." className="sm:col-span-2">
          <Input id="kb-file" ref={fileInput} type="file" accept={ACCEPT} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </Field>
        <Field id="kb-title" label="Title" hint="Optional. Defaults to the file name.">
          <Input id="kb-title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field id="kb-scope" label="Who is it for?">
          <Select id="kb-scope" value={scope} onChange={(event) => setScope(event.target.value as Scope)}>
            {scopes.map((value) => (
              <option key={value} value={value}>
                {SCOPE_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>
        {scope === "COURSE" || scope === "LESSON" ? (
          <Field id="kb-course" label="Course">
            <Select id="kb-course" value={courseId} onChange={(event) => (setCourseId(event.target.value), setLessonId(""))}>
              {courses.length === 0 ? <option value="">No courses available</option> : null}
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {scope === "LESSON" ? (
          <Field id="kb-lesson" label="Lesson">
            <Select id="kb-lesson" value={lessonId} onChange={(event) => setLessonId(event.target.value)}>
              <option value="">Choose a lesson</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {scope !== "TEACHER_PRIVATE" ? (
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-1" checked={teachersOnly} onChange={(event) => setTeachersOnly(event.target.checked)} />
            <span>
              Teachers only
              <span className="block text-xs text-muted-foreground">For answer keys, assessments and teacher notes. Students&apos; ERA Tutor never uses it.</span>
            </span>
          </label>
        ) : null}
        {formError ? (
          <Alert variant="error" className="sm:col-span-2">
            {formError}
          </Alert>
        ) : null}
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" loading={progress !== null}>
            <Upload />
            Add document
          </Button>
          {progress !== null ? <Progress value={progress} label="Upload progress" className="max-w-xs flex-1" /> : null}
        </div>
      </form>

      {loadState === "error" ? (
        <Alert variant="error">The documents couldn&apos;t load. Refresh the page to try again.</Alert>
      ) : (
        <DataTable
          caption="Knowledge Base documents"
          columns={columns}
          rows={documents}
          getRowKey={(document) => document.id}
          emptyState={<p className="py-6 text-center text-sm text-muted-foreground">{loadState === "loading" ? "Loading documents…" : "No documents yet."}</p>}
          rowActions={(document) =>
            canChange(document) ? (
              <div className="flex items-center gap-1">
                {document.status === "FAILED" ? (
                  <Button variant="ghost" size="sm" onClick={() => void retry(document)} aria-label={`Process ${document.title} again`}>
                    <RotateCcw />
                    Retry
                  </Button>
                ) : null}
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm" aria-label={`Delete ${document.title}`}>
                      <Trash2 />
                    </Button>
                  }
                  title="Delete this document?"
                  description={`${document.title} and its indexed passages will be removed. Assistants will stop using it.`}
                  confirmLabel="Delete document"
                  destructive
                  onConfirm={() => remove(document)}
                />
              </div>
            ) : null
          }
        />
      )}
    </div>
  );
}
