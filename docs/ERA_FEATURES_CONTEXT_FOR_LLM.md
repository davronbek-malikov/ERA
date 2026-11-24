# ERA Academy: what we built, and how

This document explains three features of ERA Academy:

1. **Student payment control**
2. **Student homework control**
3. **The ERA Assistant** (the chatbot and automatic Telegram messages)

For each feature it covers:
- **The problem:** what the teacher needed.
- **What we built:** what the teacher can do now.
- **How it works:** the technical design.
- **How we built it:** the steps, the problems we met in real use, and how we fixed them.

---

## The project in short

ERA Academy is a platform for an online academy where an AI instructor teaches AI/LLM courses to small groups.
A course usually runs one month ("LLM 3-oy", "RAG 1-oy"; *oy* means month). The teacher works in Uzbek. Other
teachers can join and manage their own students.

**Technology:**
- **Web app:** Next.js 15 (App Router) and TypeScript
- **Database:** PostgreSQL on Supabase, accessed with Prisma
- **Hosting:** Vercel
- **Telegram:** the Telegram Bot API, and Telegram MTProto through the GramJS library
- **AI:** Anthropic Claude, OpenAI, Groq or a local Ollama model

The main idea behind all three features:
> **One enrollment = one student in one course = one month.** Each month has its own dates, price, payments,
> homework and exam result. When a student starts a new month, the old one moves to the student's history and
> can still be opened.

---

## Feature 1: Student payment control

### The problem
Students pay the teacher outside the platform (bank transfer or cash). The teacher needed to answer three questions:
- Who has paid?
- Who still owes money, and how much?
- For which month is the money?

They also needed a way to let a student study before paying, without losing track of the debt.

### What we built
- **Price per month:** every enrollment (month) has its own price, payment arrangement and due date.
  - Arrangements: *pay in full*, *pay later*, or *free*.
- **Recording a payment.** The teacher can record a payment (amount, method, date, reference, note) in two ways:
  - **"Record payment":** saved as *pending*. It only counts after someone checks the money arrived and approves it.
  - **"To'landi" (Confirm payment):** records and approves in one step, for teachers allowed to approve.
- **Balance for each month:** price, paid, remaining and status (*unpaid*, *partly paid*, *fully paid*), plus an *overdue* warning.
- **Fixing mistakes without deleting anything:**
  - **Reject** a pending payment, with a reason.
  - **Reverse** an approved payment that was wrong, with a reason.
  - **Correct** the amount: the old record stays and a new, linked record is added.
  - **Move to another month:** for a payment saved on the wrong month of the same student.
- **Choosing the month:** every payment dialog asks **"Which month is this payment for?"** and shows each month's debt.
- **"Unpaid months" box** at the top of the student profile: every month with debt, including finished months, each with its own confirm button.
- **Access control:**
  - **"Pay Later":** lets an unpaid student study until a chosen date.
  - The teacher can also restrict, restore or extend access.
- **Moving to the next month:**
  - **"Move to next month"** finishes the current month, saves its exam result and starts the next month in one step.
  - If the old month still owes money, the dialog says so: the debt stays on the old month.
- **Removing and returning:**
  - **"Remove from course"** keeps all data.
  - **"Return to course"** brings the student back with their payments and homework.

### How it works
- **Data:**
  - Payments are stored in a `PaymentTransaction` table linked to one enrollment.
  - Each payment has a status: `PENDING`, `APPROVED`, `REJECTED` or `REVERSED`.
- **Balance:** only `APPROVED` money counts. The balance is never stored; it is always calculated from the transactions (`summarizePayments`).
- **Nothing is edited or deleted.**
  - A correction or a move marks the original as reversed or rejected.
  - It then creates a new record that points back to the original (`correctionOfId`).
  - So the full history can always be read.
- **Safe retries:** every request carries an *idempotency key*. If the internet drops and the browser sends the same request twice, only one payment is saved.
- **Audit log:** every change (record, approve, reject, reverse, correct, move) writes a row to the audit log in the same database transaction.
- **Teacher scope:** teachers only see their own students.
- **Permissions:** each teacher has separate rights:
  - see payments
  - record payments
  - approve payments
  - manage enrollments
  - manage access

  The server checks these rights on every request, not only the screen.

### How we built it
1. **First version:** the payment table, the pending → approved flow, corrections and the audit log, with
   tests for every rule. Examples of rules tested: pending money doesn't count, a refund can't exceed what was
   paid, and a repeated request never creates a second payment.
2. **Simpler for daily use:** we added the one-step "To'landi" button and Pay Later access.
3. **Months and history:** students started taking a second month. The profile then showed the old month's
   results as if they were current, so we:
   - split the profile into "Current enrollments" and a collapsible "Previous courses" history
   - added the one-step "Move to next month" button
4. **Bug found in real use (each month must keep its own payment):**
   - **What happened:** a student did not pay for month 1, but the teacher let them continue to month 2. Later they paid for month 1, and the teacher confirmed it on the month 2 card. Month 2 then showed "paid" while month 1 still showed debt.
   - **Root cause:** the payment button did not say which month it was for, and finished months had no payment button at all.
   - **Fix:**
     - the month picker in every payment dialog
     - the "Unpaid months" box
     - payment buttons on finished months
     - the "Move to another month" action, which fixes old mistakes and keeps the history
     - a test proving that money moved to month 1 never counts for month 2
5. **Clearer messages:** a teacher removed a student by mistake and couldn't add them back, because a student
   can only be in a course once. Now the error message explains how to use "Return to course" instead.

---

## Feature 2: Student homework control

### The problem
The teacher needed to answer four questions:
- Is each student doing the homework?
- Is the homework correct?
- Is the student keeping the pace of 3 homeworks per week?
- Did the student finish the course and pass the exam?

### What we built
- **Lessons:** each course has ordered lessons. For each lesson the teacher writes *what I taught* and *the homework*.
- **Per-student checklist:** for every lesson the teacher sees:
  - the student's GitHub link
  - a status: *not submitted*, *to check*, *done correctly* or *needs work*
  - a note, the hand-in date, and who checked it
- **Weekly rule:** a student must hand in **3 homeworks per week**. Each teacher can turn the rule on or off and change the number.
  - The weeks are counted **from each student's own start date**, not from the calendar.
- **Status badges** on the dashboard and profile:
  - *on track*
  - *behind* ("week 2, 11–17 November: 1 of 3 handed in")
  - *ready for the exam* (all homework done)
  - **"Tugallanmagan"** (incomplete): the course end date passed with homework missing
  - **"Imtihondan o'tdi"** / **"Imtihondan yiqilgan"** (passed / failed the exam)
- **Exam result per month:** the teacher sets it on the right month, and the course name is shown so it isn't put on the wrong one. A new month starts with no result.
- **Dashboard:** counts of homework done, to check and needs work for every student, and a warning box for incomplete or failed students.

### How it works
- **Data:** each check is a `HomeworkReview` row for one enrollment and one lesson.
- **Pace calculation:** a single pure function (`computeHomeworkPace`) works out the student's state from:
  - the start date
  - the end date
  - the hand-in dates
  - the exam result
  - the teacher's rule

  Because it has no side effects it is easy to test, and the dashboard, profile, chatbot and Telegram reminders all use the same calculation.
- **Dates:** all dates use the platform timezone, so a week always ends on the same day for everyone.

### How we built it
1. **First version:** lessons with "what I taught" and homework text, plus the per-lesson check with a GitHub link and status.
2. **Weekly rule:** we added hand-in dates and the pace calculation, counted from each student's start date.
3. **Course end:** after asking for clear end-of-course labels, we added "Tugallanmagan" and the exam result ("Imtihondan o'tdi / yiqilgan").
4. **Bug found in real use (an old result showed on the new month):**
   - **What happened:** a student who had passed month 1 was moved to month 2, but month 2 showed "Imtihondan o'tdi".
   - **Root cause:** the result had been set on the wrong month.
   - **Fix:**
     - the exam control now shows the course name
     - "Move to next month" saves the result on the month that ended and starts the new month clean
5. **Tests:** each state, scope (a teacher can only check their own students) and permissions.

---

## Feature 3: ERA Assistant

The sidebar has an **ERA Assistant** group with two pages: **Chatbot** and **Messages** (Xabarlar).

### 3a. Chatbot

#### The problem
The teacher wanted to ask in plain words, for example "show me the students who haven't paid", "add a payment
for Ali" or "who is behind on homework", instead of clicking through pages.

#### What we built
- **A chat page** where the teacher asks questions by text or voice.
- **Answers from the teacher's real data:**
  - students and enrollments
  - payments and totals
  - lessons, homework and exams
- **Changes only after confirmation.** The chatbot can *prepare* changes: add a student or enrollment,
  record or correct a payment, change access, add a course or lesson, record a homework check, schedule an
  exam. Each one appears as a card with **Confirm** and **Cancel**. Nothing changes until the teacher
  presses Confirm.

#### How it works
- **AI provider:** the engine supports several providers (Anthropic Claude, OpenAI, Groq and a local Ollama model). Which one is used is set in the server settings; the keys are never in the code.
- **Tools:** the model gets a set of *tools*.
  - Read tools fetch data, always limited to the teacher's own students.
  - Write tools only create a *proposal*.
- **Confirming a proposal:** when the teacher confirms, the same server function that the normal screens use runs it, with the same permission checks and the same audit log (marked as done through the assistant).
- **Usage limits:** limits per minute and per day for each user, and the token use and cost are recorded.
- **Errors:** users see a short, safe message. Technical details go only to the server log.

#### How we built it
1. **Core:** the AI engine, the provider adapters, the read tools and the propose → confirm flow, with security
   tests. These test that a teacher can't read another teacher's students, that a proposal can't be confirmed
   by someone else, and that prompt-injection text in the data is treated as data.
2. **Bug found in real use ("the assistant is temporarily unavailable"):**
   - **What happened:** the teacher asked for the list of unpaid students and got an error.
   - **Root cause:** the server logs showed **Groq error 429**, meaning the free plan's per-minute token limit was used up. A question like this needs two AI calls in a row (fetch the data, then answer), and the second call went over the limit.
   - **Fix:**
     - when the provider says "wait", the server waits the time it asks for (up to 20 seconds) and tries again
     - Groq answers are limited to a smaller size, so less of the limit is used
     - the log now says which limit was hit (per minute or per day)
     - a new test covers both cases

   For heavy daily use, an Anthropic (Claude) key is the reliable option.

### 3b. Automatic Telegram messages

#### The problem
The teacher wanted to remind students on Telegram, for example: "You started on 4 November; this week you
had to hand in 3 homeworks but didn't." They wanted it sent automatically, from **their own Telegram number**
(not a bot), and without Telegram blocking the number for spam.

#### What we built
- **A message composer:**
  - **Who:** all students, chosen students, or only students behind the homework rule
  - **What:** the text, with personal values filled in for each student: `{name}`, `{startDate}`,
    `{course}`, `{count}`, `{required}`, `{weekFrom}`, `{weekTo}`. Dates are written in Uzbek, e.g. "4-noyabr".
  - **When:** now, on an exact date and time (calendar and clock pickers), every week, or **automatic**
  - **Automatic mode:** every day, ERA finds the students whose *own* week just ended with too few homeworks and sends each of them one personal reminder for that week
- **Two ready templates:** a general check-in message, and the automatic weekly homework reminder.
- **Sending from the teacher's own number:**
  - The teacher logs in once with their phone, the code Telegram sends, and their 2-step password if they have one.
  - If that fails, the ERA bot sends the message instead, signed with the teacher's name.
- **Random timing:**
  - Messages can be spread at random times inside a window, for example between 08:00 and 17:00 (08:01, 08:43, …).
  - Or they go out quickly with random gaps.
- **Progress for each message:** how many were sent, are waiting, or failed, and which went from the teacher's number (📱) or the bot (🤖).
- **"Send again to those not reached":** for students who had no Telegram contact when the message was first sent.

#### How it works
- **Queue:**
  - A message plan (`TelegramMessage`) creates one delivery (`TelegramDelivery`) per student per run.
  - Each delivery has its own planned send time and status.
- **Timer:**
  - A database scheduler (Supabase pg_cron) calls a protected endpoint every minute, which sends whatever is due.
  - While the Messages page is open, the page itself also triggers sending every minute, as a backup.
- **No double sending:**
  - Each run is claimed with a single atomic database update.
  - Each delivery is unique per (message, student, run), so a student never gets the same message twice even if the timer fires twice.
- **Spam protection:**
  - At most one message from the teacher's number every 40 seconds.
  - Random gaps, and no messages at night.
  - If Telegram says "wait" (FLOOD_WAIT), sending pauses.
  - If Telegram says the account is sending too much (PEER_FLOOD), ERA switches to the bot for 24 hours.
- **Security:**
  - The teacher's Telegram login session is stored **encrypted** (AES-256-GCM).
  - The bot only accepts requests signed with its secret.
  - Student invite links are signed, so they can't be forged.

#### How we built it
1. **Bot version:** students connect by opening a personal invite link, and the teacher can send to all, chosen or behind students, now or weekly.
2. **Teacher's own number:**
   - The teacher asked for messages to come from their own number, so we added the GramJS login with the encrypted session.
   - We explained the spam risk and built the protections above, including the random 08:00–17:00 window the teacher asked for.
3. **Automatic weekly reminder:** we added personal values and the "automatic" mode based on each student's own start date.
4. **Bug found in real use (messages not going out on time):**
   - **What happened:** only one message was sent; the others stayed waiting.
   - **Root cause:** no timer was running.
   - **Fix:**
     - we set up the every-minute scheduler in the database, with a new secret
     - we added the backup timer on the open page
     - we added a warning that appears when messages are late
5. **Bug found in real use ("not connected" students):**
   - **What happened:** the first message was sent before the teacher had added the students' Telegram contacts, so it showed "not connected".
   - **Fix:** the **"Send again to those not reached"** button.

---

## How we worked

- **Small steps, each tested and deployed:**
  - Every change came with automated tests (8 test suites, 50+ tests).
  - Fake services stand in for the AI providers and Telegram, so nothing real is called.
  - Only after all tests passed was the change deployed to the staging site.
- **Fixes from real use:** most improvements started from a real situation reported by the teacher, often with a screenshot. We found the cause in the code, logs or database (read-only), fixed the cause rather than the symptom, and added a test so it can't come back.
- **Safety rules we kept throughout:**
  - **Payments:** money records are never deleted or edited in place, and every change is in the audit log.
  - **Scope:** teachers only see their own students, and the server checks every permission.
  - **AI:** it prepares changes; a person confirms them.
  - **Secrets:** keys, tokens and passwords stay in the server settings, never in the code or chat.
  - **Privacy:** student data stays in the database, never in the code.
  - **Database:** changes to the staging database were made only with the owner's approval each time.
- **Language:** every screen text exists in English and Uzbek, so the teacher's workspace is fully Uzbek.
