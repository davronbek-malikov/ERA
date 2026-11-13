"use client";

import * as React from "react";
import { BookPlus, CheckCircle2, ClipboardCheck, Github, ListPlus, PencilLine, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { FormDialog, formAmount, formString } from "@/components/management/form-dialog";
import { useManagementMutation, newIdempotencyKey } from "@/components/management/use-mutation";
import type { Workspace } from "@/components/management/enrollment-forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

/*
 * Teaching forms (docs/ERA_TEACHER_HOMEWORK.md): add students, build courses and lessons, check homework.
 * The server validates everything and applies the teacher's permissions.
 */

type CourseOption = { id: string; title: string };

// ------------------------------------------------------------------------------------------------
// Add student (account + optional enrollment)
// ------------------------------------------------------------------------------------------------

export function AddStudentButton({ workspace, courses, today, canSetPrice }: { workspace: Workspace; courses: CourseOption[]; today: string; canSetPrice: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [created, setCreated] = React.useState<{ name: string; email: string; password: string | null } | null>(null);
  const [key, setKey] = React.useState(newIdempotencyKey);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const courseId = formString(form, "courseId");
    const price = canSetPrice ? formAmount(form, "priceAmount") : null;
    const paid = canSetPrice ? formAmount(form, "initialAmount") : null;
    if (Number.isNaN(price) || Number.isNaN(paid)) return toast({ title: "Amounts must be whole won, e.g. 500000.", variant: "error" });
    setPending(true);
    try {
      const response = await fetch("/api/management/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace,
          name: formString(form, "name"),
          email: formString(form, "email"),
          phone: formString(form, "phone") || null,
          githubUrl: formString(form, "githubUrl") || null,
          password: formString(form, "password") || null,
          ...(courseId
            ? {
                courseId,
                startDate: formString(form, "startDate") || today,
                endDate: formString(form, "endDate") || null,
                priceAmount: price ?? 0,
                paymentArrangement: formString(form, "arrangement") || "PAY_IN_FULL",
                paymentDueDate: formString(form, "paymentDueDate") || null,
                initialPayment: paid ? { amount: paid, method: formString(form, "method") || "BANK_TRANSFER", transactionDate: today } : null,
                idempotencyKey: key
              }
            : {})
        })
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; student?: { name: string; email: string }; temporaryPassword?: string | null } | null;
      if (!response.ok || !payload?.ok || !payload.student) {
        toast({ title: payload?.error ?? "The student couldn't be added.", variant: "error" });
        return;
      }
      setCreated({ name: payload.student.name, email: payload.student.email, password: payload.temporaryPassword ?? null });
      router.refresh();
    } catch {
      toast({ title: "You seem to be offline. Nothing was saved.", variant: "error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setCreated(null);
          setKey(newIdempotencyKey());
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="md">
          <UserPlus />
          Add student
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[min(calc(100vw-2rem),44rem)] overflow-y-auto">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
                {created.name} was added
              </DialogTitle>
              <DialogDescription>Give the student these sign-in details. The password is shown only now.</DialogDescription>
            </DialogHeader>
            <dl className="grid gap-2 rounded-lg border border-border bg-surface p-4 text-sm sm:grid-cols-[8rem,1fr]">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{created.email}</dd>
              <dt className="text-muted-foreground">Password</dt>
              <dd className="font-mono font-medium">{created.password ?? "the password you entered"}</dd>
            </dl>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add a student</DialogTitle>
              <DialogDescription>Creates the student&apos;s account. Choose a course to enroll them right away.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="new-student-name" label="Full name" required>
                  <Input id="new-student-name" name="name" required minLength={2} maxLength={120} />
                </Field>
                <Field id="new-student-email" label="Email" required>
                  <Input id="new-student-email" name="email" type="email" required />
                </Field>
                <Field id="new-student-github" label="GitHub link" hint="Profile or homework repository">
                  <Input id="new-student-github" name="githubUrl" placeholder="https://github.com/username" />
                </Field>
                <Field id="new-student-phone" label="Phone (optional)">
                  <Input id="new-student-phone" name="phone" placeholder="+821012345678" />
                </Field>
                <Field id="new-student-password" label="Password (optional)" hint="Leave empty and ERA creates one for you.">
                  <Input id="new-student-password" name="password" type="text" autoComplete="off" minLength={8} />
                </Field>
              </div>
              <fieldset className="grid gap-4 rounded-lg border border-border p-3 sm:grid-cols-2">
                <legend className="px-1 text-xs font-medium text-muted-foreground">Enroll in a course (optional)</legend>
                <Field id="new-student-course" label="Course">
                  <Select id="new-student-course" name="courseId" defaultValue="">
                    <option value="">Don&apos;t enroll yet</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="new-student-start" label="Start">
                    <Input id="new-student-start" name="startDate" type="date" defaultValue={today} />
                  </Field>
                  <Field id="new-student-end" label="End">
                    <Input id="new-student-end" name="endDate" type="date" />
                  </Field>
                </div>
                {canSetPrice ? (
                  <>
                    <Field id="new-student-price" label="Tuition (₩)" hint="Whole won, e.g. 500000">
                      <Input id="new-student-price" name="priceAmount" inputMode="numeric" placeholder="500000" />
                    </Field>
                    <Field id="new-student-arrangement" label="Payment">
                      <Select id="new-student-arrangement" name="arrangement" defaultValue="PAY_IN_FULL">
                        <option value="PAY_IN_FULL">Pay in full</option>
                        <option value="PARTIAL">Partial payments</option>
                        <option value="PAY_LATER">Pay later (study first)</option>
                        <option value="WAIVED">Free</option>
                      </Select>
                    </Field>
                    <Field id="new-student-due" label="Payment due date">
                      <Input id="new-student-due" name="paymentDueDate" type="date" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field id="new-student-paid" label="Paid now (₩)" hint="Recorded as pending">
                        <Input id="new-student-paid" name="initialAmount" inputMode="numeric" placeholder="0" />
                      </Field>
                      <Field id="new-student-method" label="Method">
                        <Select id="new-student-method" name="method" defaultValue="BANK_TRANSFER">
                          <option value="BANK_TRANSFER">Bank transfer</option>
                          <option value="CASH">Cash</option>
                          <option value="OTHER">Other</option>
                        </Select>
                      </Field>
                    </div>
                  </>
                ) : null}
              </fieldset>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending} aria-busy={pending}>
                  {pending ? "Adding…" : "Add student"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------
// Courses and lessons
// ------------------------------------------------------------------------------------------------

export function CreateCourseButton({ workspace, instructors = [] }: { workspace: Workspace; instructors?: Array<{ id: string; name: string }> }) {
  const { run } = useManagementMutation();
  return (
    <FormDialog
      triggerLabel="New course"
      triggerVariant="default"
      triggerSize="md"
      triggerIcon={<BookPlus />}
      title="Create a course"
      description="Write one lesson per line. You can add what you taught and the homework for each lesson afterwards."
      submitLabel="Create course"
      wide
      onSubmit={async (form) => {
        const lessons = formString(form, "lessons")
          .split(/\r?\n/)
          .map((line) => line.replace(/^\s*\d+[.)-]?\s*/, "").trim())
          .filter(Boolean);
        return Boolean(
          await run(
            "/api/management/courses",
            "POST",
            {
              workspace,
              title: formString(form, "title"),
              instructorId: formString(form, "instructorId") || undefined,
              description: formString(form, "description") || null,
              durationWeeks: formString(form, "durationWeeks") || null,
              ...(lessons.length ? { lessons: lessons.map((title) => ({ title })) } : { lessonCount: formString(form, "lessonCount") || 0 })
            },
            "Course created."
          )
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr,10rem]">
        <Field id="course-title" label="Course name" required>
          <Input id="course-title" name="title" required minLength={2} maxLength={160} placeholder="Machine Learning Foundation" />
        </Field>
        <Field id="course-weeks" label="Duration (weeks)">
          <Input id="course-weeks" name="durationWeeks" type="number" min={1} max={104} placeholder="4" />
        </Field>
      </div>
      {instructors.length ? (
        <Field id="course-teacher" label="Teacher" required>
          <Select id="course-teacher" name="instructorId" required defaultValue={instructors[0]?.id}>
            {instructors.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>
                {instructor.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field id="course-description" label="Description (optional)">
        <Textarea id="course-description" name="description" rows={2} maxLength={4000} />
      </Field>
      <Field id="course-lessons" label="Lessons, one per line" hint="Or leave empty and enter a number of lessons below.">
        <Textarea id="course-lessons" name="lessons" rows={6} placeholder={"Introduction to ML\nLinear regression\nLogistic regression"} />
      </Field>
      <Field id="course-lesson-count" label="…or number of lessons">
        <Input id="course-lesson-count" name="lessonCount" type="number" min={0} max={60} placeholder="11" />
      </Field>
    </FormDialog>
  );
}

export function LessonEditorButton({
  workspace,
  lesson,
  courseId,
  mode
}: {
  workspace: Workspace;
  courseId: string;
  lesson?: { id: string; position: number; title: string; taughtSummary: string | null; homework: string | null };
  mode: "edit" | "add";
}) {
  const { run } = useManagementMutation();
  return (
    <FormDialog
      triggerLabel={mode === "add" ? "Add lesson" : "Edit"}
      triggerVariant={mode === "add" ? "outline" : "ghost"}
      triggerIcon={mode === "add" ? <ListPlus /> : <PencilLine />}
      title={mode === "add" ? "Add a lesson" : `Lesson ${lesson?.position}`}
      submitLabel="Save lesson"
      wide
      onSubmit={async (form) => {
        const body = { workspace, title: formString(form, "title"), taughtSummary: formString(form, "taughtSummary") || null, homework: formString(form, "homework") || null };
        return Boolean(
          mode === "add"
            ? await run(`/api/management/courses/${courseId}/lessons`, "POST", body, "Lesson added.")
            : await run(`/api/management/lessons/${lesson!.id}`, "PATCH", body, "Lesson saved.")
        );
      }}
    >
      <Field id={`lesson-title-${lesson?.id ?? courseId}`} label="Lesson title" required>
        <Input id={`lesson-title-${lesson?.id ?? courseId}`} name="title" required maxLength={160} defaultValue={lesson?.title ?? ""} />
      </Field>
      <Field id={`lesson-taught-${lesson?.id ?? courseId}`} label="What I taught" hint="Topics, code, notebooks — what students should be able to do now.">
        <Textarea id={`lesson-taught-${lesson?.id ?? courseId}`} name="taughtSummary" rows={5} maxLength={6000} defaultValue={lesson?.taughtSummary ?? ""} />
      </Field>
      <Field id={`lesson-homework-${lesson?.id ?? courseId}`} label="Homework" hint="Exactly what students must submit, so you can check it against their GitHub.">
        <Textarea id={`lesson-homework-${lesson?.id ?? courseId}`} name="homework" rows={5} maxLength={6000} defaultValue={lesson?.homework ?? ""} />
      </Field>
    </FormDialog>
  );
}

// ------------------------------------------------------------------------------------------------
// Homework review and GitHub link
// ------------------------------------------------------------------------------------------------

export function HomeworkReviewButton({
  workspace,
  enrollmentId,
  lessonId,
  lessonLabel,
  current
}: {
  workspace: Workspace;
  enrollmentId: string;
  lessonId: string;
  lessonLabel: string;
  current: { status: string; githubUrl: string | null; note: string | null } | null;
}) {
  const { run } = useManagementMutation();
  return (
    <FormDialog
      triggerLabel={current ? "Update" : "Check"}
      triggerVariant={current ? "ghost" : "outline"}
      triggerIcon={<ClipboardCheck />}
      title={`Homework — ${lessonLabel}`}
      submitLabel="Save check"
      onSubmit={async (form) =>
        Boolean(
          await run(
            "/api/management/homework",
            "PUT",
            { workspace, enrollmentId, lessonId, status: formString(form, "status"), githubUrl: formString(form, "githubUrl") || null, note: formString(form, "note") || null },
            "Homework check saved."
          )
        )
      }
    >
      <Field id={`hw-status-${enrollmentId}-${lessonId}`} label="Result">
        <Select id={`hw-status-${enrollmentId}-${lessonId}`} name="status" defaultValue={current?.status ?? "DONE"}>
          <option value="DONE">Done correctly</option>
          <option value="NEEDS_WORK">Needs work</option>
          <option value="SUBMITTED">Submitted — check later</option>
          <option value="NOT_SUBMITTED">Not submitted</option>
        </Select>
      </Field>
      <Field id={`hw-link-${enrollmentId}-${lessonId}`} label="Link to the student's work" hint="Repository, folder, commit or notebook">
        <Input id={`hw-link-${enrollmentId}-${lessonId}`} name="githubUrl" defaultValue={current?.githubUrl ?? ""} placeholder="https://github.com/student/ml-homework/tree/main/lesson-3" />
      </Field>
      <Field id={`hw-note-${enrollmentId}-${lessonId}`} label="Note (optional)" hint="What was missing, what to fix…">
        <Textarea id={`hw-note-${enrollmentId}-${lessonId}`} name="note" rows={3} maxLength={4000} defaultValue={current?.note ?? ""} />
      </Field>
    </FormDialog>
  );
}

export function GithubLinkButton({ workspace, studentId, current }: { workspace: Workspace; studentId: string; current: string | null }) {
  const { run } = useManagementMutation();
  return (
    <FormDialog
      triggerLabel={current ? "Change" : "Add GitHub"}
      triggerVariant="ghost"
      triggerIcon={<Github />}
      title="Student's GitHub"
      submitLabel="Save"
      onSubmit={async (form) => Boolean(await run(`/api/management/students/${studentId}`, "PATCH", { workspace, githubUrl: formString(form, "githubUrl") || null }, "GitHub link saved."))}
    >
      <Field id={`github-${studentId}`} label="GitHub profile or repository">
        <Input id={`github-${studentId}`} name="githubUrl" defaultValue={current ?? ""} placeholder="https://github.com/username" />
      </Field>
    </FormDialog>
  );
}
