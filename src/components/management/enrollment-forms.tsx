"use client";

import * as React from "react";
import { CalendarClock, KeyRound, PencilLine, UserPlus } from "lucide-react";

import { FormDialog, formAmount, formString } from "@/components/management/form-dialog";
import { newIdempotencyKey, useManagementMutation } from "@/components/management/use-mutation";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

/*
 * Enrollment forms (Student Management). The server re-validates everything and applies the user's permissions;
 * these forms only collect input. Amounts are whole won.
 */

export type Workspace = "admin" | "teacher";
type CourseOption = { id: string; title: string; instructorId: string; instructorName: string };
type InstructorOption = { id: string; name: string };
type StudentOption = { id: string; name: string; email: string; status: string };

function StudentPicker({ workspace, preset }: { workspace: Workspace; preset?: { id: string; name: string } }) {
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
      <Field id="enroll-student" label="Student">
        <Input id="enroll-student" value={preset.name} readOnly />
        <input type="hidden" name="studentId" value={preset.id} />
      </Field>
    );
  }

  return (
    <Field id="enroll-student-search" label="Student" hint="Search existing student accounts by name or email." required>
      <Input id="enroll-student-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Ali or ali@example.com" autoComplete="off" />
      <input type="hidden" name="studentId" value={selected?.id ?? ""} />
      <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto" aria-label="Matching students">
        {loading ? <li className="text-xs text-muted-foreground">Searching…</li> : null}
        {!loading && !results.length ? <li className="text-xs text-muted-foreground">No matching student accounts.</li> : null}
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
  preset
}: {
  workspace: Workspace;
  courses: CourseOption[];
  instructors: InstructorOption[];
  permissions: { viewPayments: boolean; recordPayments: boolean; approvePayments: boolean; manageAccess: boolean };
  today: string;
  preset?: { id: string; name: string };
}) {
  const { run } = useManagementMutation();
  const [key, setKey] = React.useState(newIdempotencyKey);
  const [arrangement, setArrangement] = React.useState("PAY_IN_FULL");
  const [courseId, setCourseId] = React.useState(courses[0]?.id ?? "");
  const course = courses.find((item) => item.id === courseId);

  const arrangements = [
    { value: "PAY_IN_FULL", label: "Pay in full" },
    { value: "PARTIAL", label: "Partial payments" },
    ...(permissions.manageAccess ? [{ value: "PAY_LATER", label: "Pay Later (study before paying)" }] : []),
    ...(permissions.approvePayments ? [{ value: "WAIVED", label: "Free / waived" }] : [])
  ];

  async function submit(form: FormData) {
    const studentId = formString(form, "studentId");
    if (!studentId) {
      toast({ title: "Choose a student first.", variant: "error" });
      return false;
    }
    const price = permissions.viewPayments ? formAmount(form, "priceAmount") : null;
    const initial = permissions.recordPayments ? formAmount(form, "initialAmount") : null;
    if (Number.isNaN(price) || Number.isNaN(initial)) {
      toast({ title: "Amounts must be whole numbers of won (e.g. 500000).", variant: "error" });
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
    if (result) setKey(newIdempotencyKey());
    return Boolean(result);
  }

  return (
    <FormDialog
      triggerLabel="New enrollment"
      triggerVariant="default"
      triggerSize="md"
      triggerIcon={<UserPlus />}
      title="Enroll a student"
      description="Creates a new enrollment. Earlier enrollments stay in the student's history."
      submitLabel="Create enrollment"
      wide
      onOpen={() => setKey(newIdempotencyKey())}
      onSubmit={submit}
    >
      <StudentPicker workspace={workspace} preset={preset} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="enroll-course" label="Course" required>
          <Select id="enroll-course" name="courseId" value={courseId} onChange={(event) => setCourseId(event.target.value)} required>
            {courses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </Select>
        </Field>
        {workspace === "admin" ? (
          <Field id="enroll-teacher" label="Assigned teacher" hint={course ? `Course teacher: ${course.instructorName}` : undefined}>
            <Select id="enroll-teacher" name="instructorId" defaultValue="">
              <option value="">Course teacher</option>
              {instructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field id="enroll-start" label="Start date" required>
          <Input id="enroll-start" name="startDate" type="date" defaultValue={today} required />
        </Field>
        <Field id="enroll-end" label="Expected end date">
          <Input id="enroll-end" name="endDate" type="date" />
        </Field>
      </div>

      {permissions.viewPayments ? (
        <fieldset className="grid gap-4 rounded-lg border border-border p-3 sm:grid-cols-2">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Payment</legend>
          <Field id="enroll-arrangement" label="Payment arrangement">
            <Select id="enroll-arrangement" value={arrangement} onChange={(event) => setArrangement(event.target.value)}>
              {arrangements.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="enroll-price" label="Course price (₩)" hint="Whole won, e.g. 500000" required={arrangement !== "WAIVED"}>
            <Input id="enroll-price" name="priceAmount" inputMode="numeric" placeholder="500000" />
          </Field>
          <Field id="enroll-due" label="Payment due date" required={arrangement === "PAY_LATER"}>
            <Input id="enroll-due" name="paymentDueDate" type="date" required={arrangement === "PAY_LATER"} />
          </Field>
          {permissions.recordPayments ? (
            <>
              <Field id="enroll-initial" label="Initial payment (₩, optional)" hint="Recorded as pending until approved.">
                <Input id="enroll-initial" name="initialAmount" inputMode="numeric" placeholder="0" />
              </Field>
              <Field id="enroll-initial-method" label="Payment method">
                <Select id="enroll-initial-method" name="initialMethod" defaultValue="BANK_TRANSFER">
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="CASH">Cash</option>
                  <option value="ONLINE">Online</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>
              <Field id="enroll-initial-date" label="Payment date">
                <Input id="enroll-initial-date" name="initialDate" type="date" defaultValue={today} />
              </Field>
            </>
          ) : null}
        </fieldset>
      ) : (
        <p className="text-xs text-muted-foreground">You can&apos;t set prices or payments. An administrator can add them later.</p>
      )}

      <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Course access</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="grantAccess" defaultChecked className="mt-1" disabled={arrangement === "PAY_LATER"} />
          Let the student open the course now
        </label>
        {permissions.manageAccess ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="restrictWhenOverdue" className="mt-1" />
            Pause access automatically if the payment is overdue
          </label>
        ) : null}
        {arrangement === "PAY_LATER" ? (
          <Field id="enroll-approval" label="Pay Later approval note" hint="Why this student may study before paying.">
            <Input id="enroll-approval" name="accessNote" maxLength={500} />
          </Field>
        ) : null}
      </fieldset>

      <Field id="enroll-note" label="Internal note" hint="Visible to staff only, never to the student.">
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
        toast({ title: "The price must be a whole number of won.", variant: "error" });
        return false;
      }
      if (price !== null) set("priceAmount", price, current.priceAmount);
    }
    Object.keys(body).forEach((key) => body[key] === undefined && delete body[key]);
    if (Object.keys(body).length <= 2) {
      toast({ title: "Nothing changed." });
      return true;
    }
    return Boolean(await run(`/api/management/enrollments/${enrollmentId}`, "PATCH", body, "Enrollment updated."));
  }

  return (
    <FormDialog triggerLabel="Edit" triggerIcon={<PencilLine />} title="Edit enrollment" submitLabel="Save changes" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        {canManageEnrollments ? (
          <>
            <Field id={`edit-start-${enrollmentId}`} label="Start date">
              <Input id={`edit-start-${enrollmentId}`} name="startDate" type="date" defaultValue={current.startDate ?? ""} />
            </Field>
            <Field id={`edit-end-${enrollmentId}`} label="Expected end date">
              <Input id={`edit-end-${enrollmentId}`} name="endDate" type="date" defaultValue={current.endDate ?? ""} />
            </Field>
            <Field id={`edit-status-${enrollmentId}`} label="Enrollment status">
              <Select id={`edit-status-${enrollmentId}`} name="status" defaultValue={current.status}>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="EXPIRED">Expired</option>
                <option value="TRANSFERRED">Transferred</option>
              </Select>
            </Field>
            {workspace === "admin" ? (
              <Field id={`edit-teacher-${enrollmentId}`} label="Assigned teacher">
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
        <Field id={`edit-due-${enrollmentId}`} label="Payment due date">
          <Input id={`edit-due-${enrollmentId}`} name="paymentDueDate" type="date" defaultValue={current.paymentDueDate ?? ""} />
        </Field>
        {canChangePrice ? (
          <Field id={`edit-price-${enrollmentId}`} label="Course price (₩)">
            <Input id={`edit-price-${enrollmentId}`} name="priceAmount" inputMode="numeric" defaultValue={current.priceAmount ?? ""} />
          </Field>
        ) : null}
      </div>
      <Field id={`edit-reason-${enrollmentId}`} label="Reason (kept in the audit log)">
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
      triggerLabel="Access"
      triggerIcon={<KeyRound />}
      title="Change course access"
      description="Access is separate from payment: Pay Later lets an unpaid student study. Every change is logged."
      submitLabel="Apply"
      destructive={action === "revoke"}
      onSubmit={submit}
    >
      <Field id={`access-action-${enrollmentId}`} label="Change">
        <Select id={`access-action-${enrollmentId}`} value={action} onChange={(event) => setAction(event.target.value)}>
          {ACCESS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      {action === "grant_pay_later" ? (
        <Field id={`access-due-${enrollmentId}`} label="Payment due date" required>
          <Input id={`access-due-${enrollmentId}`} name="paymentDueDate" type="date" defaultValue={current.paymentDueDate ?? ""} required />
        </Field>
      ) : null}
      {action === "extend" ? (
        <Field id={`access-expiry-${enrollmentId}`} label="New last day of access" required>
          <Input id={`access-expiry-${enrollmentId}`} name="accessExpiresAt" type="date" defaultValue={current.accessExpiresAt ?? ""} required />
        </Field>
      ) : null}
      {action === "set_overdue_rule" || action === "grant_pay_later" ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="restrictWhenOverdue" defaultChecked={current.restrictWhenOverdue} className="mt-1" />
          Pause access automatically if the payment becomes overdue
        </label>
      ) : null}
      <Field id={`access-reason-${enrollmentId}`} label="Reason / approval note" required>
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
