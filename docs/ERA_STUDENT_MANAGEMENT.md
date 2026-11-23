# ERA Student Management & Payments

**Audience:** ERA's owner and developers. It explains what the module does, how it is built, and where each rule lives.

**Status:** implemented and tested locally. Not yet deployed (see "Deployment").

---

## 1. What it does

Administrators and authorized teachers can answer these questions, and act on them, from the workspaces or by asking the ERA Assistant:
- who their students are, and which courses they take, from when to when;
- how much each student has paid and still owes;
- who may study without having paid (Pay Later);
- who has exams this Saturday, and which courses end soon.

**ERA never takes money.** Students pay outside ERA, by bank transfer or cash. ERA records each payment, an authorized person verifies it arrived and approves it, and only approved payments count.

## 2. Architecture decisions (from inspecting the existing system)

| Decision | Why |
|---|---|
| **Extended `Enrollment`** instead of a new `course_enrollments` table | Every access check, progress record and classroom already uses `Enrollment`. A second table would have duplicated the rules. |
| **One enrollment per student per course** (the existing unique key) | Keeps every existing access check correct. A new course is always a new enrollment, so history is never overwritten. *Limitation:* to retake the *same* course, reopen or extend the old enrollment (see §11). |
| **Assigned teacher = `Enrollment.instructorId`** | Defaults to the course's teacher. Existing enrollments were backfilled by the migration. Teachers manage exactly the enrollments assigned to them. |
| **Payment status is calculated, never stored** | It can't disagree with the transactions. |
| **Access is separate from payment** | `accessStatus` and `restrictWhenOverdue` decide access. The payment status never does, which is what makes Pay Later possible. |
| **ERA's own sign-in and `authz.ts`** | ERA does not use Supabase Auth. Authorization stays on the server, deny-by-default. RLS is added as an extra layer (§7). |
| **The shared AI engine got structured tools** | No second chatbot or provider. The model can read through tools; it can only *propose* changes, which run after a button confirmation. |

## 3. Data model (migration `2_student_management`)

**`Enrollment`, new columns** (all nullable or with defaults, so existing data stays valid):
- `instructor_id`: the assigned teacher.
- `status`: ACTIVE / COMPLETED / CANCELLED / EXPIRED / TRANSFERRED.
- `start_date`, `end_date`, `completed_at`.
- `price_amount` (integer won), `currency` (KRW).
- `payment_arrangement`: PAY_IN_FULL / PARTIAL / PAY_LATER / WAIVED. Null means a legacy enrollment with no fee.
- `payment_due_date`.
- `access_status`: ACTIVE / RESTRICTED / REVOKED.
- `access_expires_at`: the last day of access, inclusive.
- `restrict_when_overdue`.
- `access_granted_by_id`, `access_note`, `internal_note`, `created_by_id`.

**New tables:**

| Table | Purpose |
|---|---|
| `payment_transactions` | One payment or refund. `status` is PENDING / APPROVED / REJECTED / REVERSED. Stores who recorded, reviewed and reversed it, and when; the rejection and reversal reasons; `correction_of_id`; and a unique `idempotency_key`. **Never deleted.** Its enrollment can't be deleted while it exists (ON DELETE RESTRICT). |
| `enrollment_access_logs` | Every access change: before and after status and expiry, arrangement, reason, who made it, and source (MANUAL / AI / SYSTEM). |
| `student_notes` | Staff notes. Never shown to students. |
| `exam_schedules`, `exam_participants` | Exams: date plus local HH:MM times. No participants means the whole course. |
| `instructor_permissions` | What each teacher may do, set by admins. No row means the defaults. |
| `management_audit_logs` | One row per change, written in the same database transaction, with before and after snapshots and the source. |
| `ai_pending_actions` | Changes the AI proposed: preview, status, result, and a 30-minute expiry. |

**Indexes** cover the common filters: teacher, status, start, end and due dates, transaction status and date, and exam date.

**Dates.** Business dates are PostgreSQL `date` values in the platform timezone (`ERA_TIMEZONE`, default **Asia/Seoul**). In code they are `"YYYY-MM-DD"` strings, so no timezone shift can move a date. Exam times are local `HH:MM`. Audit timestamps are UTC.

**Money.** All amounts are integers in won. There is no floating point anywhere. The largest single amount is ₩2,000,000,000.

## 4. Calculations (`src/server/management/money.ts`)

```
approved total = Σ APPROVED payments − Σ APPROVED refunds
remaining      = max(0, price − approved total)      (an overpayment shows as a credit)

WAIVED          arrangement is WAIVED
NO_FEE          no price recorded, or price 0
FULLY_PAID      approved total ≥ price
PARTIALLY_PAID  0 < approved total < price
UNPAID          approved total ≤ 0

overdue         remaining > 0 and the due date has passed
```

PENDING, REJECTED and REVERSED transactions never reduce the balance. Nobody can mark something "fully paid" by hand: the status only follows approved transactions. The one exception is WAIVED, which needs the "approve payments" permission.

## 5. Payment workflow (manual verification)

1. **Record.** A user with *record payments* records a payment, which starts as **PENDING**.
2. **Approve or reject.** A user with *approve payments* (admins, or teachers granted it) approves it or rejects it with a reason.
3. **Reverse.** An APPROVED payment can be **reversed** with a reason. It stays visible and stops counting.
4. **Correct.** The original is kept: reversed if it was approved, rejected if it was pending. A new **PENDING** record with the right amount is linked to it through `correction_of_id`.
5. **Refunds** are recorded the same way. An approved refund can't exceed the approved payments.
6. **Retries are safe.** The same `idempotencyKey` returns the first transaction. Each form generates a fresh key every time it opens, and AI actions use `ai-action:<id>`.

## 6. Access and Pay Later (`src/server/management/access.ts`)

A student may open a course when **all** of these hold:
- the enrollment status is ACTIVE or COMPLETED;
- the access status is ACTIVE;
- the last day of access, if set, hasn't passed;
- if `restrictWhenOverdue` is on, the payment isn't overdue.

This one check runs inside `authz.ts` (`resolveCourseAccess`, `requireLessonAccess`, `requireStudentEnrollment`). It therefore covers the classroom, lesson API, tutor, Ask ERA AI, progress, reviews, material downloads and practice. A blocked student sees a friendly explanation with contact instructions.

**Pay Later** sets arrangement PAY_LATER, access ACTIVE, a due date and an approval note, and records who approved it. The payment status stays **UNPAID**, shown in red. Access actions are grant Pay Later, restrict, revoke, restore, extend and the overdue rule. **Each one is logged** in `enrollment_access_logs` and in the audit log. Re-enrolling through the public course page never restores revoked access.

## 7. Permissions

### Role and permission matrix

| Capability | Admin | Teacher (default) | Teacher with permission | Student |
|---|---|---|---|---|
| See students and enrollments | All | **Assigned to them only** | same | Own only (read-only, §9) |
| Add notes; schedule, edit and delete exams | ✓ | ✓ (own courses and students) | | ✗ |
| See prices, payments, balances | ✓ | ✗ (money fields are *absent*, not zero) | `viewPayments` | Own enrollments only |
| Record payments (PENDING) | ✓ | ✗ | `recordPayments` | ✗ |
| Approve, reject, reverse; change price; waive fee | ✓ | ✗ | `approvePayments` | ✗ (never their own) |
| Create enrollments; change dates and status | ✓ | ✗ | `manageEnrollments` (own courses; self as teacher) | ✗ |
| Pay Later, restrict, revoke, restore, extend | ✓ | ✗ | `manageAccess` | ✗ |
| Reassign the teacher of an enrollment | ✓ | ✗ | ✗ | ✗ |
| Change teacher permissions | ✓ | ✗ | ✗ | ✗ |

Recording or approving payments automatically includes seeing them.

- **Admins** set permissions at **Admin → Students → Teacher permissions**.
- **Enforcement:** `src/server/management/actor.ts` resolves the actor from the session, never from the request. Every service function asserts the permission and filters by scope. Someone else's record looks exactly like a missing one (404).
- **Pages:** admin pages live in `(admin-only)`, which redirects non-admins on the server.
- **Contact details:** teachers see the email address of their *assigned* students, as this module requires. Teachers with `manageEnrollments` can also search all student accounts by name or email to enroll someone. **This is a deliberate change** from the Prompt 07 rule that hid contact details from teachers; the older *Progress* page still shows none.

### Row Level Security (migration `3_row_level_security`)

RLS is **enabled on every table, with no policies**:
- **Supabase's public Data API** (the `anon` and `authenticated` roles) can read and change nothing.
- **ERA itself** connects through Prisma as the table owner, so it is unaffected. RLS is not forced on the owner.
- **A test checks it:** a role without BYPASSRLS, even with SELECT granted, sees 0 rows.
- **Server-side rules:** all access rules stay in `authz.ts` and the management services. The service-role key is used only on the server for storage and never reaches the browser.

## 8. ERA AI assistant (`src/server/ai/management-tools.ts`)

The shared engine (`src/server/ai/engine.ts`) now supports **structured tool calls** for Anthropic, OpenAI and Ollama. The Teacher and Admin assistants receive these tools, filtered to what the user may do:

| Read tools (run immediately) | Proposal tools (need confirmation) |
|---|---|
| `find_students`: by name or email; several matches mean "ask which one" | `propose_enrollment` |
| `list_enrollments`: unpaid, partially paid, overdue, outstanding, ending between dates, upcoming exams, by course | `propose_payment`: always PENDING |
| `get_student_profile`: current enrollments, history, payments, access log, exams, notes | `propose_payment_review`: approve, reject, reverse |
| `find_courses` | `propose_payment_correction` |
| `list_payments`: by status, date, student | `propose_enrollment_update`: dates, due date, status, price |
| `financial_summary`: collected, outstanding, counts | `propose_access_change`: Pay Later, restrict, revoke, restore, extend, overdue rule |
| `list_exams`: date range, e.g. "this Saturday" | `propose_exam` |

**Safety rules:**
- **No SQL tool.** There is no free-form query tool, and no tool generates SQL. Every input goes through the same parsers as the forms (`inputs.ts`).
- **Same scope as the user.** Read tools use the same scoped queries as the pages, and money is omitted without permission.
- **Proposals write nothing.** A proposal runs the operation's own `check…` function, then stores a pending action with a human-readable preview, consequences and warnings.
- **Confirmation is a button.** The user presses **Confirm** on the card, which calls `POST /api/ai/actions/:id`. Typing "yes" does not execute anything.
- **Runs once, re-checked.** Only the proposal's owner can confirm it, within 30 minutes, at most once: a conditional PENDING → EXECUTING update stops double runs. It runs with the user's **current** permissions, and the operation's transaction re-checks everything.
- **Results are recorded.** The outcome goes into the audit log (source AI) and into the conversation.
- **The model is told the date.** Its instructions include today's date and weekday in Asia/Seoul. It must answer only from tool results, ask when a name or course is ambiguous, and never claim a change is done before confirmation.

## 9. Student view

**My courses → Enrollments & payments** shows:
- dates and teacher;
- whether the student can study (with Pay Later shown as such);
- payment status, confirmed paid, remaining and due date;
- the student's own transactions, with their status;
- course history.

It never shows internal notes, approval notes, approvers or other students. Blocked access shows the reason and a support instruction.

## 10. Screens, API and files

**Admin (Students group)**

| Screen | Path |
|---|---|
| Student management (summary, filters, table, New enrollment) | `/admin/students` |
| Student profile | `/admin/students/[studentId]` |
| Payments (approval queue and all transactions) | `/admin/students/payments` |
| Exams & schedule (month, week, upcoming) | `/admin/students/schedule` |
| Teacher permissions | `/admin/students/permissions` |

**Teacher (Students group)**

| Screen | Path |
|---|---|
| My students | `/teacher/my-students` |
| Student profile | `/teacher/my-students/[studentId]` |
| Payments (only with permission) | `/teacher/payments` |
| Exams & schedule | `/teacher/schedule` |

The older teacher "Students" page is now labelled **Progress**.

**API** (`/api/management/*`, same-origin, JSON, session-based; `workspace=teacher` lets an admin act as a teacher):

| Method | Path |
|---|---|
| POST | `/enrollments` |
| PATCH | `/enrollments/:id` |
| POST | `/enrollments/:id/access` |
| POST | `/payments` |
| POST | `/payments/:id` (`approve`, `reject`, `reverse`, `correct`) |
| POST | `/exams` |
| PATCH, DELETE | `/exams/:id` |
| POST | `/notes` |
| PUT | `/teachers/:instructorId/permissions` |
| GET | `/students/:id` |
| GET | `/lookup` |

**AI confirmation:** `POST /api/ai/actions/:id` with `{ decision: "confirm" | "cancel" }`.

**Code:**
- `src/server/management/`: actor, access, money, time, inputs, enrollments, payments, exams, queries, student-view, teacher-permissions, audit, http.
- `src/components/management/`: badges, forms, views.
- `src/server/ai/actions.ts`, `src/server/ai/management-tools.ts`.

## 11. Limitations

1. **Same-course retakes.** One enrollment per student per course. To retake a finished course, set the old enrollment back to ACTIVE and change its dates; it keeps its payment history. A true second enrollment of the same course would need the unique key removed and every access query reviewed.
2. **No online checkout.** This is deliberate: payments happen outside ERA. Stripe or Toss can be added later as a source of APPROVED transactions.
3. **Large lists.** The student table filters and sorts on the server after loading up to 2,000 scoped enrollments. That is fine for an academy; very large deployments would need SQL-side payment aggregation.
4. **One currency.** Totals on the dashboard assume KRW. Other currencies are stored as entered and never converted.
5. **Real AI not yet verified.** AI tool use was tested with a scripted model. Real Claude behaviour (wording, when it asks for clarification) must be checked on staging.
6. **Notes can't be edited or deleted.** Staff notes are append-only by design.

## 12. Deployment

There are two migrations to apply, after `0_baseline` and `1_knowledge_base`:
- **`2_student_management`** adds columns and tables and backfills the assigned teacher. It deletes and changes nothing else.
- **`3_row_level_security`** enables RLS on all tables. ERA connects as the table owner, so it is unaffected. Supabase's public Data API is blocked from then on.

Apply them with `npx prisma migrate deploy` over a direct or session-pooler connection, on **staging first** (see `ERA_PROMPT_09_STAGING_GUIDE.md`).

There is one optional new setting: `ERA_TIMEZONE`, default `Asia/Seoul`.
