"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, BookPlus, CheckCircle2, ClipboardCheck, ListPlus, PencilLine, Search, UserCheck, UserMinus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { FormDialog, formAmount, formString } from "@/components/management/form-dialog";
import { useManagementMutation, newIdempotencyKey } from "@/components/management/use-mutation";
import type { Workspace } from "@/components/management/enrollment-forms";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useT } from "@/components/i18n/locale-provider";

/*
 * Teaching forms (docs/ERA_TEACHER_HOMEWORK.md): add students, build courses and lessons, check homework.
 * The server validates everything and applies the teacher's permissions.
 */

type CourseOption = { id: string; title: string };

// ------------------------------------------------------------------------------------------------
// Add student (account + optional enrollment)
// ------------------------------------------------------------------------------------------------

export function AddStudentButton({ workspace, courses, today, canSetPrice }: { workspace: Workspace; courses: CourseOption[]; today: string; canSetPrice: boolean }) {
  const T = useT();
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
    if (Number.isNaN(price) || Number.isNaN(paid)) return toast({ title: T("Amounts must be whole won, e.g. 500000."), variant: "error" });
    setPending(true);
    try {
      const response = await fetch("/api/management/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace,
          name: formString(form, "name"),
          telegram: formString(form, "telegram") || null,
          githubUrl: formString(form, "githubUrl") || null,
          ...(courseId
            ? {
                courseId,
                startDate: formString(form, "startDate") || today,
                endDate: formString(form, "endDate") || null,
                priceAmount: price ?? 0,
                paymentArrangement: formString(form, "arrangement") || "PAY_IN_FULL",
                paymentDueDate: formString(form, "paymentDueDate") || null,
                initialPayment: paid ? { amount: paid, method: "OTHER", transactionDate: today } : null,
                idempotencyKey: key
              }
            : {})
        })
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; student?: { name: string; email: string }; temporaryPassword?: string | null } | null;
      if (!response.ok || !payload?.ok || !payload.student) {
        toast({ title: payload?.error ?? T("The student couldn't be added."), variant: "error" });
        return;
      }
      router.refresh();
      if (payload.temporaryPassword) {
        setCreated({ name: payload.student.name, email: payload.student.email, password: payload.temporaryPassword });
      } else {
        toast({ title: T("{name} was added", { name: payload.student.name }), variant: "success" });
        setOpen(false);
      }
    } catch {
      toast({ title: T("You seem to be offline. Nothing was saved."), variant: "error" });
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
          {T("Add student")}
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
              <DialogDescription>{T("Give the student these sign-in details. The password is shown only now.")}</DialogDescription>
            </DialogHeader>
            <dl className="grid gap-2 rounded-lg border border-border bg-surface p-4 text-sm sm:grid-cols-[8rem,1fr]">
              <dt className="text-muted-foreground">{T("Email")}</dt>
              <dd className="font-medium">{created.email}</dd>
              <dt className="text-muted-foreground">{T("Password")}</dt>
              <dd className="font-mono font-medium">{created.password ?? T("the password you entered")}</dd>
            </dl>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>{T("Done")}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{T("Add a student")}</DialogTitle>
              <DialogDescription>{T("Creates the student's account. Choose a course to enroll them right away.")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="new-student-name" label={T("Full name")} required>
                  <Input id="new-student-name" name="name" required minLength={2} maxLength={120} />
                </Field>
                <Field id="new-student-telegram" label={T("Telegram (optional)")} hint={T("Username or phone number, e.g. @alikarimov")}>
                  <Input id="new-student-telegram" name="telegram" placeholder="@alikarimov" autoComplete="off" />
                </Field>
                <Field id="new-student-github" label={T("GitHub link")} hint={T("Profile or homework repository")}>
                  <Input id="new-student-github" name="githubUrl" placeholder="https://github.com/username" />
                </Field>
              </div>
              <fieldset className="grid gap-4 rounded-lg border border-border p-3 sm:grid-cols-2">
                <legend className="px-1 text-xs font-medium text-muted-foreground">{T("Enroll in a course (optional)")}</legend>
                <Field id="new-student-course" label={T("Course")}>
                  <Select id="new-student-course" name="courseId" defaultValue="">
                    <option value="">{T("Don't enroll yet")}</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="new-student-start" label={T("Start")}>
                    <Input id="new-student-start" name="startDate" type="date" defaultValue={today} />
                  </Field>
                  <Field id="new-student-end" label={T("End")}>
                    <Input id="new-student-end" name="endDate" type="date" />
                  </Field>
                </div>
                {canSetPrice ? (
                  <>
                    <Field id="new-student-price" label={T("Tuition (₩)")} hint={T("Whole won, e.g. 500000")}>
                      <Input id="new-student-price" name="priceAmount" inputMode="numeric" placeholder="500000" />
                    </Field>
                    <Field id="new-student-arrangement" label={T("Payment")}>
                      <Select id="new-student-arrangement" name="arrangement" defaultValue="PAY_IN_FULL">
                        <option value="PAY_IN_FULL">{T("Pay in full")}</option>
                        <option value="PARTIAL">{T("Partial payments")}</option>
                        <option value="PAY_LATER">{T("Pay later (study first)")}</option>
                        <option value="WAIVED">{T("Free")}</option>
                      </Select>
                    </Field>
                    <Field id="new-student-due" label={T("Payment due date")}>
                      <Input id="new-student-due" name="paymentDueDate" type="date" />
                    </Field>
                    <Field id="new-student-paid" label={T("Paid now (₩)")} hint={T("Recorded as pending")}>
                      <Input id="new-student-paid" name="initialAmount" inputMode="numeric" placeholder="0" />
                    </Field>
                  </>
                ) : null}
              </fieldset>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  {T("Cancel")}
                </Button>
                <Button type="submit" disabled={pending} aria-busy={pending}>
                  {pending ? T("Adding…") : T("Add student")}
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
  const T = useT();
  const { run } = useManagementMutation();
  return (
    <FormDialog
      triggerLabel={T("New course")}
      triggerVariant="default"
      triggerSize="md"
      triggerIcon={<BookPlus />}
      title={T("Create a course")}
      description={T("Write one lesson per line. You can add what you taught and the homework for each lesson afterwards.")}
      submitLabel={T("Create course")}
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
        <Field id="course-title" label={T("Course name")} required>
          <Input id="course-title" name="title" required minLength={2} maxLength={160} placeholder="Machine Learning Foundation" />
        </Field>
        <Field id="course-weeks" label={T("Duration (weeks)")}>
          <Input id="course-weeks" name="durationWeeks" type="number" min={1} max={104} placeholder="4" />
        </Field>
      </div>
      {instructors.length ? (
        <Field id="course-teacher" label={T("Teacher")} required>
          <Select id="course-teacher" name="instructorId" required defaultValue={instructors[0]?.id}>
            {instructors.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>
                {instructor.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field id="course-description" label={T("Description (optional)")}>
        <Textarea id="course-description" name="description" rows={2} maxLength={4000} />
      </Field>
      <Field id="course-lessons" label={T("Lessons, one per line")} hint={T("Or leave empty and enter a number of lessons below.")}>
        <Textarea id="course-lessons" name="lessons" rows={6} placeholder={"Introduction to ML\nLinear regression\nLogistic regression"} />
      </Field>
      <Field id="course-lesson-count" label={T("…or number of lessons")}>
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
  const T = useT();
  const { run } = useManagementMutation();
  return (
    <FormDialog
      triggerLabel={mode === "add" ? T("Add lesson") : T("Edit")}
      triggerVariant={mode === "add" ? "outline" : "ghost"}
      triggerIcon={mode === "add" ? <ListPlus /> : <PencilLine />}
      title={mode === "add" ? T("Add a lesson") : T("Lesson {number}", { number: lesson?.position ?? "" })}
      submitLabel={T("Save lesson")}
      wide
      onSubmit={async (form) => {
        const body = { workspace, title: formString(form, "title"), taughtSummary: formString(form, "taughtSummary") || null, homework: formString(form, "homework") || null };
        return Boolean(
          mode === "add"
            ? await run(`/api/management/courses/${courseId}/lessons`, "POST", body, T("Lesson added."))
            : await run(`/api/management/lessons/${lesson!.id}`, "PATCH", body, T("Lesson saved."))
        );
      }}
    >
      <Field id={`lesson-title-${lesson?.id ?? courseId}`} label={T("Lesson title")} required>
        <Input id={`lesson-title-${lesson?.id ?? courseId}`} name="title" required maxLength={160} defaultValue={lesson?.title ?? ""} />
      </Field>
      <Field id={`lesson-taught-${lesson?.id ?? courseId}`} label={T("What I taught")} hint={T("Topics, code, notebooks — what students should be able to do now.")}>
        <Textarea id={`lesson-taught-${lesson?.id ?? courseId}`} name="taughtSummary" rows={5} maxLength={6000} defaultValue={lesson?.taughtSummary ?? ""} />
      </Field>
      <Field id={`lesson-homework-${lesson?.id ?? courseId}`} label={T("Homework")} hint={T("Exactly what students must submit, so you can check it against their GitHub.")}>
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
  const T = useT();
  const { run } = useManagementMutation();
  return (
    <FormDialog
      triggerLabel={current ? T("Update") : T("Check")}
      triggerVariant={current ? "ghost" : "outline"}
      triggerIcon={<ClipboardCheck />}
      title={T("Homework — {lesson}", { lesson: lessonLabel })}
      submitLabel={T("Save check")}
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
      <Field id={`hw-status-${enrollmentId}-${lessonId}`} label={T("Result")}>
        <Select id={`hw-status-${enrollmentId}-${lessonId}`} name="status" defaultValue={current?.status ?? "DONE"}>
          <option value="DONE">{T("Done correctly")}</option>
          <option value="NEEDS_WORK">{T("Needs work")}</option>
          <option value="SUBMITTED">{T("Submitted — check later")}</option>
          <option value="NOT_SUBMITTED">{T("Not submitted")}</option>
        </Select>
      </Field>
      <Field id={`hw-link-${enrollmentId}-${lessonId}`} label={T("Link to the student's work")} hint={T("Repository, folder, commit or notebook")}>
        <Input id={`hw-link-${enrollmentId}-${lessonId}`} name="githubUrl" defaultValue={current?.githubUrl ?? ""} placeholder="https://github.com/student/ml-homework/tree/main/lesson-3" />
      </Field>
      <Field id={`hw-note-${enrollmentId}-${lessonId}`} label={T("Note (optional)")} hint={T("What was missing, what to fix…")}>
        <Textarea id={`hw-note-${enrollmentId}-${lessonId}`} name="note" rows={3} maxLength={4000} defaultValue={current?.note ?? ""} />
      </Field>
    </FormDialog>
  );
}

export function StudentContactButton({
  workspace,
  studentId,
  github,
  telegram
}: {
  workspace: Workspace;
  studentId: string;
  github: string | null;
  telegram: string | null;
}) {
  const T = useT();
  const { run } = useManagementMutation();
  return (
    <FormDialog
      triggerLabel={T("Edit")}
      triggerVariant="ghost"
      triggerIcon={<PencilLine />}
      title="Contact"
      submitLabel={T("Save")}
      onSubmit={async (form) =>
        Boolean(
          await run(
            `/api/management/students/${studentId}`,
            "PATCH",
            { workspace, githubUrl: formString(form, "githubUrl") || null, telegram: formString(form, "telegram") || null },
            "Saved."
          )
        )
      }
    >
      <Field id={`telegram-${studentId}`} label={T("Telegram (optional)")} hint={T("Username or phone number, e.g. @alikarimov")}>
        <Input id={`telegram-${studentId}`} name="telegram" defaultValue={telegram ?? ""} placeholder="@alikarimov" />
      </Field>
      <Field id={`github-${studentId}`} label={T("GitHub profile or repository")}>
        <Input id={`github-${studentId}`} name="githubUrl" defaultValue={github ?? ""} placeholder="https://github.com/username" />
      </Field>
    </FormDialog>
  );
}

/** Move a course up or down in the teacher's own order (saved immediately). */
export function CourseOrderButtons({ workspace, order, index }: { workspace: Workspace; order: string[]; index: number }) {
  const T = useT();
  const { run, pending } = useManagementMutation();
  function move(delta: number) {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void run("/api/management/courses/order", "PUT", { workspace, courseIds: next }, T("Course order saved."));
  }
  return (
    <span className="flex items-center gap-1">
      <Button type="button" size="sm" variant="ghost" disabled={pending || index === 0} onClick={() => move(-1)} aria-label={T("Move up")} title={T("Move up")}>
        <ArrowUp />
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending || index === order.length - 1} onClick={() => move(1)} aria-label={T("Move down")} title={T("Move down")}>
        <ArrowDown />
      </Button>
    </span>
  );
}

/** Remove a student from a course (access off immediately, history kept) or bring them back. Asks first. */
export function CourseMembershipButton({
  workspace,
  enrollmentId,
  studentName,
  courseTitle,
  action,
  compact
}: {
  workspace: Workspace;
  enrollmentId: string;
  studentName: string;
  courseTitle: string;
  action: "remove" | "restore";
  compact?: boolean;
}) {
  const T = useT();
  const { run, pending } = useManagementMutation();
  const removing = action === "remove";
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant={removing ? "ghost" : "outline"} disabled={pending} className={removing ? "text-error hover:bg-error/10 hover:text-error" : undefined} aria-label={removing ? T("Remove from course") : T("Return to course")} title={removing ? T("Remove from course") : T("Return to course")}>
          {removing ? <UserMinus /> : <UserCheck />}
          {compact ? null : removing ? T("Remove from course") : T("Return to course")}
        </Button>
      }
      title={removing ? T("Remove {name} from {course}?", { name: studentName, course: courseTitle }) : T("Return {name} to {course}?", { name: studentName, course: courseTitle })}
      description={
        removing
          ? T("They lose access to this course right away. Their payments, homework results and history are kept, and you can return them later from their profile.")
          : T("They can open the course again right away.")
      }
      confirmLabel={removing ? T("Remove from course") : T("Return to course")}
      cancelLabel={T("Cancel")}
      destructive={removing}
      onConfirm={async () => {
        await run(`/api/management/enrollments/${enrollmentId}/membership`, "POST", { workspace, action }, removing ? "Removed from the course." : "Returned to the course.");
      }}
    />
  );
}

/**
 * The teacher's student list filter: one search box plus (when they may see payments) a payment dropdown that
 * applies as soon as it changes. A name search also finds students removed from a course (history), so they can
 * be opened and returned; the payment filter only looks at current students.
 */
export function TeacherStudentSearch({
  basePath,
  q,
  payment,
  showPayment
}: {
  basePath: string;
  q: string;
  payment: string;
  showPayment: boolean;
}) {
  const T = useT();
  const router = useRouter();
  const [text, setText] = React.useState(q);

  function go(nextQ: string, nextPayment: string) {
    const params = new URLSearchParams();
    if (nextQ.trim()) {
      params.set("q", nextQ.trim());
      params.set("status", "all");
    }
    if (nextPayment) params.set("payment", nextPayment);
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <form
      role="search"
      className="flex flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        go(text, payment);
      }}
    >
      <Input type="search" value={text} onChange={(event) => setText(event.target.value)} placeholder={T("Search students")} aria-label={T("Search students")} className="min-w-0 flex-1 basis-48" />
      {showPayment ? (
        <Select value={payment} onChange={(event) => go(text, event.target.value)} aria-label={T("Payment status")} className="w-auto min-w-40">
          <option value="">{T("All payments")}</option>
          <option value="FULLY_PAID">{T("Fully paid")}</option>
          <option value="PARTIALLY_PAID">{T("Partially paid")}</option>
          <option value="UNPAID">{T("Unpaid")}</option>
        </Select>
      ) : null}
      <Button type="submit" variant="outline" aria-label={T("Search students")}>
        <Search />
      </Button>
      {q || payment ? (
        <Button type="button" variant="ghost" onClick={() => { setText(""); go("", ""); }}>
          {T("Clear")}
        </Button>
      ) : null}
    </form>
  );
}
