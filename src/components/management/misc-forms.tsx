"use client";

import * as React from "react";
import { CalendarPlus, PencilLine, StickyNote, Trash2 } from "lucide-react";

import { FormDialog, formString } from "@/components/management/form-dialog";
import { useManagementMutation } from "@/components/management/use-mutation";
import type { Workspace } from "@/components/management/enrollment-forms";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/components/i18n/locale-provider";

// ------------------------------------------------------------------------------------------------
// Notes
// ------------------------------------------------------------------------------------------------

export function AddNoteButton({
  studentId,
  workspace,
  enrollments
}: {
  studentId: string;
  workspace: Workspace;
  enrollments: Array<{ id: string; course: string }>;
}) {
  const T = useT();
  const { run } = useManagementMutation();
  return (
    <FormDialog
      triggerLabel={T("Add note")}
      triggerIcon={<StickyNote />}
      title={T("Add an internal note")}
      description={T("Staff only. Students never see notes.")}
      submitLabel={T("Save note")}
      onSubmit={async (form) =>
        Boolean(
          await run(
            "/api/management/notes",
            "POST",
            { workspace, studentId, enrollmentId: formString(form, "enrollmentId") || null, note: formString(form, "note") },
            "Note saved."
          )
        )
      }
    >
      <Field id={`note-course-${studentId}`} label={T("About")}>
        <Select id={`note-course-${studentId}`} name="enrollmentId" defaultValue="">
          <option value="">{T("The student in general")}</option>
          {enrollments.map((enrollment) => (
            <option key={enrollment.id} value={enrollment.id}>
              {enrollment.course}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`note-text-${studentId}`} label={T("Note")} required>
        <Textarea id={`note-text-${studentId}`} name="note" rows={4} required maxLength={4000} />
      </Field>
    </FormDialog>
  );
}

// ------------------------------------------------------------------------------------------------
// Exams
// ------------------------------------------------------------------------------------------------

type CourseOption = { id: string; title: string };
type ExamValues = {
  id?: string;
  courseId: string;
  title: string;
  description: string | null;
  examDate: string;
  startTime: string;
  endTime: string | null;
  status: string;
  enrollmentIds: string[];
};

export function ExamFormButton({
  workspace,
  courses,
  initial,
  today,
  timezone
}: {
  workspace: Workspace;
  courses: CourseOption[];
  initial?: ExamValues;
  today: string;
  timezone: string;
}) {
  const T = useT();
  const { run } = useManagementMutation();
  const [courseId, setCourseId] = React.useState(initial?.courseId ?? courses[0]?.id ?? "");
  const [students, setStudents] = React.useState<Array<{ id: string; user: { name: string } }>>([]);
  const [loading, setLoading] = React.useState(false);

  const loadStudents = React.useCallback(
    async (id: string) => {
      if (!id) return setStudents([]);
      setLoading(true);
      try {
        const response = await fetch(`/api/management/lookup?type=course-students&workspace=${workspace}&courseId=${encodeURIComponent(id)}`, { cache: "no-store" });
        const payload = (await response.json()) as { ok?: boolean; enrollments?: Array<{ id: string; user: { name: string } }> };
        setStudents(payload.ok ? (payload.enrollments ?? []) : []);
      } catch {
        setStudents([]);
      } finally {
        setLoading(false);
      }
    },
    [workspace]
  );

  async function submit(form: FormData) {
    const body = {
      workspace,
      courseId,
      title: formString(form, "title"),
      description: formString(form, "description") || null,
      examDate: formString(form, "examDate"),
      startTime: formString(form, "startTime"),
      endTime: formString(form, "endTime") || null,
      status: formString(form, "status") || "SCHEDULED",
      enrollmentIds: form.getAll("enrollmentIds").map(String)
    };
    return Boolean(
      initial?.id
        ? await run(`/api/management/exams/${initial.id}`, "PATCH", body, "Exam updated.")
        : await run("/api/management/exams", "POST", body, "Exam scheduled.")
    );
  }

  return (
    <FormDialog
      triggerLabel={initial?.id ? T("Edit") : "Schedule exam"}
      triggerVariant={initial?.id ? "outline" : "default"}
      triggerSize={initial?.id ? "sm" : "md"}
      triggerIcon={initial?.id ? <PencilLine /> : <CalendarPlus />}
      title={initial?.id ? "Edit exam" : "Schedule an exam"}
      description={`Times are in ${timezone}.`}
      submitLabel={initial?.id ? "Save exam" : "Schedule exam"}
      wide
      onOpen={() => void loadStudents(courseId)}
      onSubmit={submit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="exam-course" label={T("Course")} required>
          <Select
            id="exam-course"
            value={courseId}
            onChange={(event) => {
              setCourseId(event.target.value);
              void loadStudents(event.target.value);
            }}
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="exam-title" label={T("Title")} required>
          <Input id="exam-title" name="title" defaultValue={initial?.title ?? ""} required maxLength={160} placeholder="Midterm exam" />
        </Field>
        <Field id="exam-date" label={T("Date")} required>
          <Input id="exam-date" name="examDate" type="date" defaultValue={initial?.examDate ?? today} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="exam-start" label={T("Start")} required>
            <Input id="exam-start" name="startTime" type="time" defaultValue={initial?.startTime ?? "10:00"} required />
          </Field>
          <Field id="exam-end" label={T("End")}>
            <Input id="exam-end" name="endTime" type="time" defaultValue={initial?.endTime ?? ""} />
          </Field>
        </div>
        {initial?.id ? (
          <Field id="exam-status" label={T("Status")}>
            <Select id="exam-status" name="status" defaultValue={initial.status}>
              <option value="SCHEDULED">Scheduled</option>
              <option value="COMPLETED">{T("Completed")}</option>
              <option value="CANCELLED">{T("Cancelled")}</option>
            </Select>
          </Field>
        ) : null}
      </div>
      <Field id="exam-description" label={T("Description")}>
        <Textarea id="exam-description" name="description" rows={2} defaultValue={initial?.description ?? ""} maxLength={2000} />
      </Field>
      <fieldset className="flex flex-col gap-1 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Students (leave all unticked for the whole course)</legend>
        {loading ? <p className="text-xs text-muted-foreground">Loading students…</p> : null}
        {!loading && !students.length ? <p className="text-xs text-muted-foreground">No active students in this course yet.</p> : null}
        <div className="grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2">
          {students.map((student) => (
            <label key={student.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enrollmentIds" value={student.id} defaultChecked={initial?.enrollmentIds.includes(student.id)} />
              {student.user.name}
            </label>
          ))}
        </div>
      </fieldset>
    </FormDialog>
  );
}

export function DeleteExamButton({ examId, workspace, title }: { examId: string; workspace: Workspace; title: string }) {
  const T = useT();
  const { run } = useManagementMutation();
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="ghost">
          <Trash2 />
          {T("Delete")}
        </Button>
      }
      title="Delete this exam?"
      description={`"${title}" will be removed from the schedule. The deletion is kept in the audit log.`}
      confirmLabel="Delete exam"
      destructive
      onConfirm={async () => {
        await run(`/api/management/exams/${examId}?workspace=${workspace}`, "DELETE", null, "Exam deleted.");
      }}
    />
  );
}

// ------------------------------------------------------------------------------------------------
// Teacher permissions (admins)
// ------------------------------------------------------------------------------------------------

type Permissions = { viewPayments: boolean; recordPayments: boolean; approvePayments: boolean; manageEnrollments: boolean; manageAccess: boolean };

export function TeacherPermissionsForm({ instructorId, initial, labels }: { instructorId: string; initial: Permissions; labels: Record<keyof Permissions, string> }) {
  const T = useT();
  const { run, pending } = useManagementMutation();
  const [value, setValue] = React.useState(initial);
  const dirty = (Object.keys(initial) as Array<keyof Permissions>).some((key) => initial[key] !== value[key]);

  function toggle(key: keyof Permissions, checked: boolean) {
    setValue((current) => {
      const next = { ...current, [key]: checked };
      // Recording or approving payments implies seeing them (the server enforces the same rule).
      if ((key === "recordPayments" || key === "approvePayments") && checked) next.viewPayments = true;
      if (key === "viewPayments" && !checked) {
        next.recordPayments = false;
        next.approvePayments = false;
      }
      return next;
    });
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        await run(`/api/management/teachers/${instructorId}/permissions`, "PUT", { workspace: "admin", ...value }, "Permissions saved.");
      }}
    >
      {(Object.keys(labels) as Array<keyof Permissions>).map((key) => (
        <label key={key} className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={value[key]} onChange={(event) => toggle(key, event.target.checked)} />
          {labels[key]}
        </label>
      ))}
      <div>
        <Button type="submit" size="sm" disabled={!dirty || pending}>
          {pending ? T("Saving…") : "Save permissions"}
        </Button>
      </div>
    </form>
  );
}
