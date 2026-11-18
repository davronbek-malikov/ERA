"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRightCircle, CalendarClock, KeyRound, PencilLine, UserPlus } from "lucide-react";

import { FormDialog, formAmount, formString } from "@/components/management/form-dialog";
import { newIdempotencyKey, useManagementMutation } from "@/components/management/use-mutation";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useT } from "@/components/i18n/locale-provider";

/*
 * Enrollment forms (Student Management). The server re-validates everything and applies the user's permissions;
 * these forms only collect input. Amounts are whole won.
 */

export type Workspace = "admin" | "teacher";
type CourseOption = { id: string; title: string; instructorId: string; instructorName: string };
type InstructorOption = { id: string; name: string };
type StudentOption = { id: string; name: string; email: string; status: string };

function StudentPicker({ workspace, preset }: { workspace: Workspace; preset?: { id: string; name: string } }) {
  const T = useT();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<StudentOption[]>([]);
  const [selected, setSelected] = React.useState<{ id: string; name: string } | null>(preset ?? null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (preset) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/management/lookup?type=students&workspace=${workspace}&q=${encodeURIComponent(query)}`, { cache: "no-store" });
        const payload = (await response.json()) as { ok?: boolean; students?: StudentOption[] };
        setResults(payload.ok ? (payload.students ?? []) : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, workspace, preset]);

  if (preset) {
    return (
      <Field id="enroll-student" label={T("Student")}>
        <Input id="enroll-student" value={preset.name} readOnly />
        <input type="hidden" name="studentId" value={preset.id} />
      </Field>
    );
  }

  return (
    <Field id="enroll-student-search" label={T("Student")} hint={T("Search existing student accounts by name or email.")} required>
      <Input id="enroll-student-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={T("e.g. Ali or ali@example.com")} autoComplete="off" />
      <input type="hidden" name="studentId" value={selected?.id ?? ""} />
      <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto" aria-label={T("Matching students")}>
        {loading ? <li className="text-xs text-muted-foreground">{T("Searching…")}</li> : null}
        {!loading && !results.length ? <li className="text-xs text-muted-foreground">{T("No matching student accounts.")}</li> : null}
        {results.map((student) => (
          <li key={student.id}>
            <button
              type="button"
              onClick={() => setSelected({ id: student.id, name: student.name })}
              aria-pressed={selected?.id === student.id}
              className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-left text-sm ${
                selected?.id === student.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
              }`}
            >
              <span className="truncate">{student.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {student.email}
                {student.status !== "ACTIVE" ? " · inactive" : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {selected ? <p className="mt-1 text-xs">Selected: {selected.name}</p> : null}
    </Field>
  );
}

export function CreateEnrollmentButton({
  workspace,
  courses,
  instructors,
  permissions,
  today,
  preset,
  finishable
}: {
  workspace: Workspace;
  courses: CourseOption[];
  instructors: InstructorOption[];
  permissions: { viewPayments: boolean; recordPayments: boolean; approvePayments: boolean; manageAccess: boolean };
  today: string;
  preset?: { id: string; name: string };
  /** The preset student's current courses: offered to be finished when they move on to the next course. */
  finishable?: Array<{ id: string; title: string }>;
}) {
  const T = useT();
  const { run } = useManagementMutation();
  const router = useRouter();
  const [finish, setFinish] = React.useState<Set<string>>(() => new Set((finishable ?? []).map((item) => item.id)));
  const [key, setKey] = React.useState(newIdempotencyKey);
  const [arrangement, setArrangement] = React.useState("PAY_IN_FULL");
  const [courseId, setCourseId] = React.useState(courses[0]?.id ?? "");
  const course = courses.find((item) => item.id === courseId);

  const arrangements = [
    { value: "PAY_IN_FULL", label: T("Pay in full") },
    { value: "PARTIAL", label: T("Partial payments") },
    ...(permissions.manageAccess ? [{ value: "PAY_LATER", label: T("Pay Later (study before paying)") }] : []),
    ...(permissions.approvePayments ? [{ value: "WAIVED", label: T("Free / waived") }] : [])
  ];

  async function submit(form: FormData) {
    const studentId = formString(form, "studentId");
    if (!studentId) {
      toast({ title: T("Choose a student first."), variant: "error" });
      return false;
    }
    const price = permissions.viewPayments ? formAmount(form, "priceAmount") : null;
    const initial = permissions.recordPayments ? formAmount(form, "initialAmount") : null;
    if (Number.isNaN(price) || Number.isNaN(initial)) {
      toast({ title: T("Amounts must be whole numbers of won (e.g. 500000)."), variant: "error" });
      return false;
    }
    const result = await run(
      "/api/management/enrollments",
      "POST",
      {
        workspace,
        studentId,
        courseId: formString(form, "courseId"),
        instructorId: workspace === "admin" ? formString(form, "instructorId") || undefined : undefined,
        startDate: formString(form, "startDate"),
        endDate: formString(form, "endDate") || null,
        priceAmount: price,
        currency: "KRW",
        paymentArrangement: arrangement,
        paymentDueDate: formString(form, "paymentDueDate") || null,
        grantAccess: form.get("grantAccess") === "on" || arrangement === "PAY_LATER",
        restrictWhenOverdue: form.get("restrictWhenOverdue") === "on",
        accessNote: formString(form, "accessNote") || null,
        internalNote: formString(form, "internalNote") || null,
        initialPayment: initial ? { amount: initial, method: formString(form, "initialMethod") || "BANK_TRANSFER", transactionDate: formString(form, "initialDate") || today } : null,
        idempotencyKey: key
      },
      "Enrollment created."
    );
    if (result) {
      setKey(newIdempotencyKey());
      // Moving on: the finished courses leave "current" (kept under Previous courses).
      const done = [...finish].filter((id) => (finishable ?? []).some((item) => item.id === id));
      for (const id of done) {
        await fetch(`/api/management/enrollments/${id}/membership`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace, action: "complete" }) }).catch(() => null);
      }
      if (done.length) {
        toast({ title: T("{count} previous course(s) moved to Previous courses.", { count: done.length }), variant: "success" });
        router.refresh();
      }
    }
    return Boolean(result);
  }

  return (
    <FormDialog
      triggerLabel={T("New enrollment")}
      triggerVariant="default"
      triggerSize="md"
      triggerIcon={<UserPlus />}
      title={T("Enroll a student")}
      description={T("Creates a new enrollment. Earlier enrollments stay in the student's history.")}
      submitLabel={T("Create enrollment")}
      wide
      onOpen={() => setKey(newIdempotencyKey())}
      onSubmit={submit}
    >
      <StudentPicker workspace={workspace} preset={preset} />
      {finishable?.length ? (
        <fieldset className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <legend className="px-1 text-xs font-semibold">{T("Moving on to the next course?")}</legend>
          {finishable.map((item) => (
            <label key={item.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={finish.has(item.id)}
                onChange={() =>
                  setFinish((current) => {
                    const next = new Set(current);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  })
                }
              />
              {T("Finish {course} (moves to Previous courses)", { course: item.title })}
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="enroll-course" label={T("Course")} required>
          <Select id="enroll-course" name="courseId" value={courseId} onChange={(event) => setCourseId(event.target.value)} required>
            {courses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </Select>
        </Field>
        {workspace === "admin" ? (
          <Field id="enroll-teacher" label={T("Assigned teacher")} hint={course ? `Course teacher: ${course.instructorName}` : undefined}>
            <Select id="enroll-teacher" name="instructorId" defaultValue="">
              <option value="">{T("Course teacher")}</option>
              {instructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field id="enroll-start" label={T("Start date")} required>
          <Input id="enroll-start" name="startDate" type="date" defaultValue={today} required />
        </Field>
        <Field id="enroll-end" label={T("Expected end date")}>
          <Input id="enroll-end" name="endDate" type="date" />
        </Field>
      </div>

      {permissions.viewPayments ? (
        <fieldset className="grid gap-4 rounded-lg border border-border p-3 sm:grid-cols-2">
          <legend className="px-1 text-xs font-medium text-muted-foreground">{T("Payment")}</legend>
          <Field id="enroll-arrangement" label={T("Payment arrangement")}>
            <Select id="enroll-arrangement" value={arrangement} onChange={(event) => setArrangement(event.target.value)}>
              {arrangements.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="enroll-price" label={T("Course price (₩)")} hint={T("Whole won, e.g. 500000")} required={arrangement !== "WAIVED"}>
            <Input id="enroll-price" name="priceAmount" inputMode="numeric" placeholder="500000" />
          </Field>
          <Field id="enroll-due" label={T("Payment due date")} required={arrangement === "PAY_LATER"}>
            <Input id="enroll-due" name="paymentDueDate" type="date" required={arrangement === "PAY_LATER"} />
          </Field>
          {permissions.recordPayments ? (
            <>
              <Field id="enroll-initial" label={T("Initial payment (₩, optional)")} hint={T("Recorded as pending until approved.")}>
                <Input id="enroll-initial" name="initialAmount" inputMode="numeric" placeholder="0" />
              </Field>
              <Field id="enroll-initial-method" label={T("Payment method")}>
                <Select id="enroll-initial-method" name="initialMethod" defaultValue="BANK_TRANSFER">
                  <option value="BANK_TRANSFER">{T("Bank transfer")}</option>
                  <option value="CASH">{T("Cash")}</option>
                  <option value="ONLINE">{T("Online")}</option>
                  <option value="OTHER">{T("Other")}</option>
                </Select>
              </Field>
              <Field id="enroll-initial-date" label={T("Payment date")}>
                <Input id="enroll-initial-date" name="initialDate" type="date" defaultValue={today} />
              </Field>
            </>
          ) : null}
        </fieldset>
      ) : (
        <p className="text-xs text-muted-foreground">{T("You can't set prices or payments. An administrator can add them later.")}</p>
      )}

      <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">{T("Course access")}</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="grantAccess" defaultChecked className="mt-1" disabled={arrangement === "PAY_LATER"} />
          {T("Let the student open the course now")}
        </label>
        {permissions.manageAccess ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="restrictWhenOverdue" className="mt-1" />
            {T("Pause access automatically if the payment is overdue")}
          </label>
        ) : null}
        {arrangement === "PAY_LATER" ? (
          <Field id="enroll-approval" label={T("Pay Later approval note")} hint={T("Why this student may study before paying.")}>
            <Input id="enroll-approval" name="accessNote" maxLength={500} />
          </Field>
        ) : null}
      </fieldset>

      <Field id="enroll-note" label={T("Internal note")} hint={T("Visible to staff only, never to the student.")}>
        <Textarea id="enroll-note" name="internalNote" rows={2} maxLength={2000} />
      </Field>
    </FormDialog>
  );
}

export function EditEnrollmentButton({
  enrollmentId,
  workspace,
  current,
  canManageEnrollments,
  canChangePrice,
  instructors
}: {
  enrollmentId: string;
  workspace: Workspace;
  current: { startDate: string | null; endDate: string | null; paymentDueDate: string | null; status: string; priceAmount: number | null; instructorId: string | null };
  canManageEnrollments: boolean;
  canChangePrice: boolean;
  instructors: InstructorOption[];
}) {
  const T = useT();
  const { run } = useManagementMutation();

  async function submit(form: FormData) {
    const body: Record<string, unknown> = { workspace, reason: formString(form, "reason") || null };
    const set = (key: string, value: unknown, before: unknown) => {
      if (value !== before) body[key] = value;
    };
    if (canManageEnrollments) {
      set("startDate", formString(form, "startDate") || undefined, current.startDate ?? undefined);
      set("endDate", formString(form, "endDate") || null, current.endDate);
      set("status", formString(form, "status"), current.status);
      if (workspace === "admin") set("instructorId", formString(form, "instructorId") || undefined, current.instructorId ?? undefined);
    }
    set("paymentDueDate", formString(form, "paymentDueDate") || null, current.paymentDueDate);
    if (canChangePrice) {
      const price = formAmount(form, "priceAmount");
      if (Number.isNaN(price)) {
        toast({ title: T("The price must be a whole number of won."), variant: "error" });
        return false;
      }
      if (price !== null) set("priceAmount", price, current.priceAmount);
    }
    Object.keys(body).forEach((key) => body[key] === undefined && delete body[key]);
    if (Object.keys(body).length <= 2) {
      toast({ title: T("Nothing changed.") });
      return true;
    }
    return Boolean(await run(`/api/management/enrollments/${enrollmentId}`, "PATCH", body, T("Enrollment updated.")));
  }

  return (
    <FormDialog triggerLabel={T("Edit")} triggerIcon={<PencilLine />} title={T("Edit enrollment")} submitLabel={T("Save changes")} onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        {canManageEnrollments ? (
          <>
            <Field id={`edit-start-${enrollmentId}`} label={T("Start date")}>
              <Input id={`edit-start-${enrollmentId}`} name="startDate" type="date" defaultValue={current.startDate ?? ""} />
            </Field>
            <Field id={`edit-end-${enrollmentId}`} label={T("Expected end date")}>
              <Input id={`edit-end-${enrollmentId}`} name="endDate" type="date" defaultValue={current.endDate ?? ""} />
            </Field>
            <Field id={`edit-status-${enrollmentId}`} label={T("Enrollment status")}>
              <Select id={`edit-status-${enrollmentId}`} name="status" defaultValue={current.status}>
                <option value="ACTIVE">{T("Active")}</option>
                <option value="COMPLETED">{T("Completed")}</option>
                <option value="CANCELLED">{T("Cancelled")}</option>
                <option value="EXPIRED">{T("Expired")}</option>
                <option value="TRANSFERRED">{T("Transferred")}</option>
              </Select>
            </Field>
            {workspace === "admin" ? (
              <Field id={`edit-teacher-${enrollmentId}`} label={T("Assigned teacher")}>
                <Select id={`edit-teacher-${enrollmentId}`} name="instructorId" defaultValue={current.instructorId ?? ""}>
                  {instructors.map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </>
        ) : null}
        <Field id={`edit-due-${enrollmentId}`} label={T("Payment due date")}>
          <Input id={`edit-due-${enrollmentId}`} name="paymentDueDate" type="date" defaultValue={current.paymentDueDate ?? ""} />
        </Field>
        {canChangePrice ? (
          <Field id={`edit-price-${enrollmentId}`} label={T("Course price (₩)")}>
            <Input id={`edit-price-${enrollmentId}`} name="priceAmount" inputMode="numeric" defaultValue={current.priceAmount ?? ""} />
          </Field>
        ) : null}
      </div>
      <Field id={`edit-reason-${enrollmentId}`} label={T("Reason (kept in the audit log)")}>
        <Input id={`edit-reason-${enrollmentId}`} name="reason" maxLength={500} />
      </Field>
    </FormDialog>
  );
}

const ACCESS_OPTIONS = [
  { value: "grant_pay_later", label: "Grant Pay Later (study now, pay by a due date)" },
  { value: "restrict", label: "Restrict (pause access)" },
  { value: "revoke", label: "Revoke (end access)" },
  { value: "restore", label: "Restore access" },
  { value: "extend", label: "Extend access to a new last day" },
  { value: "set_overdue_rule", label: "Change the overdue rule" }
];

export function AccessButton({
  enrollmentId,
  workspace,
  current
}: {
  enrollmentId: string;
  workspace: Workspace;
  current: { accessStatus: string; paymentDueDate: string | null; accessExpiresAt: string | null; restrictWhenOverdue: boolean };
}) {
  const T = useT();
  const { run } = useManagementMutation();
  const [action, setAction] = React.useState(current.accessStatus === "ACTIVE" ? "grant_pay_later" : "restore");

  async function submit(form: FormData) {
    return Boolean(
      await run(
        `/api/management/enrollments/${enrollmentId}/access`,
        "POST",
        {
          workspace,
          action,
          reason: formString(form, "reason"),
          paymentDueDate: formString(form, "paymentDueDate") || undefined,
          accessExpiresAt: formString(form, "accessExpiresAt") || undefined,
          restrictWhenOverdue: action === "set_overdue_rule" || action === "grant_pay_later" ? form.get("restrictWhenOverdue") === "on" : undefined
        },
        "Access updated."
      )
    );
  }

  return (
    <FormDialog
      triggerLabel={T("Access")}
      triggerIcon={<KeyRound />}
      title={T("Change course access")}
      description={T("Access is separate from payment: Pay Later lets an unpaid student study. Every change is logged.")}
      submitLabel={T("Apply")}
      destructive={action === "revoke"}
      onSubmit={submit}
    >
      <Field id={`access-action-${enrollmentId}`} label={T("Change")}>
        <Select id={`access-action-${enrollmentId}`} value={action} onChange={(event) => setAction(event.target.value)}>
          {ACCESS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {T(option.label)}
            </option>
          ))}
        </Select>
      </Field>
      {action === "grant_pay_later" ? (
        <Field id={`access-due-${enrollmentId}`} label={T("Payment due date")} required>
          <Input id={`access-due-${enrollmentId}`} name="paymentDueDate" type="date" defaultValue={current.paymentDueDate ?? ""} required />
        </Field>
      ) : null}
      {action === "extend" ? (
        <Field id={`access-expiry-${enrollmentId}`} label={T("New last day of access")} required>
          <Input id={`access-expiry-${enrollmentId}`} name="accessExpiresAt" type="date" defaultValue={current.accessExpiresAt ?? ""} required />
        </Field>
      ) : null}
      {action === "set_overdue_rule" || action === "grant_pay_later" ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="restrictWhenOverdue" defaultChecked={current.restrictWhenOverdue} className="mt-1" />
          {T("Pause access automatically if the payment becomes overdue")}
        </label>
      ) : null}
      <Field id={`access-reason-${enrollmentId}`} label={T("Reason / approval note")} required>
        <Input id={`access-reason-${enrollmentId}`} name="reason" required maxLength={500} />
      </Field>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Current access: {current.accessStatus.toLowerCase()}
        {current.accessExpiresAt ? `, last day ${current.accessExpiresAt}` : ""}.
      </p>
    </FormDialog>
  );
}

/**
 * "Keyingi oyga o'tkazish": finish this course (with ITS exam result) and enroll the student in the next one, in
 * one step. The next course defaults to the one after this in the teacher's course order.
 */
export function NextCourseButton({
  workspace,
  enrollmentId,
  courseId,
  courseTitle,
  examResult,
  courses,
  today,
  price,
  showMoney
}: {
  workspace: Workspace;
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  examResult: string | null;
  courses: CourseOption[];
  today: string;
  price: number | null;
  showMoney: boolean;
}) {
  const T = useT();
  const { run } = useManagementMutation();
  const index = courses.findIndex((course) => course.id === courseId);
  const others = courses.filter((course) => course.id !== courseId);
  const suggested = (index >= 0 ? courses[index + 1] : undefined) ?? others[0];
  const [result, setResult] = React.useState<string>(examResult ?? "");

  if (!others.length) return null;
  return (
    <FormDialog
      triggerLabel={T("Move to next month")}
      triggerVariant="default"
      triggerIcon={<ArrowRightCircle />}
      title={T("Move to the next course")}
      description={T("{course} is finished and moves to Previous courses with its homework, payments and result. The new course becomes the current one.", { course: courseTitle })}
      submitLabel={T("Move to next month")}
      onOpen={() => setResult(examResult ?? "")}
      onSubmit={async (form) => {
        const amount = showMoney ? formAmount(form, "priceAmount") : undefined;
        if (showMoney && (amount === null || Number.isNaN(amount))) {
          toast({ title: T("Amounts must be whole numbers of won (e.g. 500000)."), variant: "error" });
          return false;
        }
        const body: Record<string, unknown> = {
          workspace,
          courseId: formString(form, "courseId"),
          startDate: formString(form, "startDate"),
          endDate: formString(form, "endDate") || null,
          examResult: result || null
        };
        if (showMoney) body.priceAmount = amount;
        return Boolean(await run(`/api/management/enrollments/${enrollmentId}/next`, "POST", body, "Moved to the next course."));
      }}
    >
      <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
        <legend className="px-1 text-sm font-semibold">{T("1. Result of {course}", { course: courseTitle })}</legend>
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {[
            { value: "PASSED", label: T("Passed the exam"), tone: "border-success bg-success/10 text-success" },
            { value: "FAILED", label: T("Failed the exam"), tone: "border-error bg-error/10 text-error" },
            { value: "", label: T("No exam / not set"), tone: "border-primary bg-primary/5 text-foreground" }
          ].map((option) => (
            <button
              key={option.value || "none"}
              type="button"
              role="radio"
              aria-checked={result === option.value}
              onClick={() => setResult(option.value)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${result === option.value ? option.tone : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="text-sm font-semibold">{T("2. The next course")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`next-course-${enrollmentId}`} label={T("Course")} required>
          <Select id={`next-course-${enrollmentId}`} name="courseId" defaultValue={suggested?.id} required>
            {others.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`next-start-${enrollmentId}`} label={T("Start date")} required>
          <Input id={`next-start-${enrollmentId}`} name="startDate" type="date" defaultValue={today} required />
        </Field>
        <Field id={`next-end-${enrollmentId}`} label={T("Expected end date")}>
          <Input id={`next-end-${enrollmentId}`} name="endDate" type="date" />
        </Field>
        {showMoney ? (
          <Field id={`next-price-${enrollmentId}`} label={T("Price (₩)")} required>
            <Input id={`next-price-${enrollmentId}`} name="priceAmount" inputMode="numeric" defaultValue={price === null ? "" : String(price)} required />
          </Field>
        ) : null}
      </div>
    </FormDialog>
  );
}
