# ERA teacher homework checking

**Audience:** ERA's teachers and owner. This describes the daily homework-checking workflow and how it is built.

## Why

Before this, checking homework meant opening the course schedule, finding what was taught in each lesson, then opening each student's GitHub and comparing. Now one screen shows, for every student and every lesson:
- what was taught;
- the homework that was given;
- the link to the student's work;
- the result of the check;
- the student's course dates and payments.

## Workflow

1. **Courses & lessons** (`/teacher/my-students/courses`): create a course, for example *Machine Learning Foundation*, 4 weeks, 11 lessons. For each lesson, write **what I taught** and the **homework**.
2. **Add students** (My students → **Add student**): name, email, GitHub, and optionally a course with dates and tuition. ERA creates the account and shows a temporary password once.
3. **Check homework** (My students → a student): every lesson of their course shows what was taught, the homework and the current result. Click **Check**, paste the link to the student's work, and choose a result:
   - **Done correctly**
   - **Needs work**
   - **Submitted — check later**
   - **Not submitted**

   You can add a note.
4. **Payments** appear on the same profile: tuition, paid (approved), remaining, due date, and every payment with its date and amount.

Everything above also works through the **ERA Assistant**. Each change is shown as a card and happens only after **Confirm**. For example:
- "Create course Machine Learning Foundation, 4 weeks, 11 lessons"
- "Lesson 2: I taught linear regression. Homework: train a model on the housing dataset"
- "Add student Ali Karimov, ali@gmail.com, GitHub github.com/alik, to Machine Learning Foundation from today, 500,000 won"
- "Whose homework do I still need to check?" or "Who hasn't done lesson 3?"
- "Ali did lesson 2 correctly: github.com/alik/ml/tree/main/lesson-2"

The assistant can't open GitHub itself. You check the work, and it records the result.

## Teacher menu

The Teacher Workspace shows only **My students** and **ERA Assistant**, and `/teacher` opens My students. The earlier teacher pages still exist (for example `/teacher/overview`) but are hidden from the menu.

## Permissions

- **Every teacher** may create their own courses and lessons, and check the homework of students assigned to them.
- **Adding students** needs the *Create enrollments* permission.
- **Seeing payments** needs *See payments*.

Administrators set both under **Admin → Students → Teacher permissions**. Teachers never see other teachers' students. Students never see teacher notes.

## Data

Migration `4_teacher_homework` adds:
- `Lesson.taught_summary` and `Lesson.homework`;
- `User.github_url`;
- the table `homework_reviews`: one row per enrollment and lesson, with status, link, note, and who checked it and when. RLS is enabled on it.

Every change is written to `management_audit_logs`.

## Code

- **Server:** `src/server/management/teaching.ts`.
- **Screens:** `src/components/management/teaching-forms.tsx`, `courses-view.tsx`, and the homework section of `profile-view.tsx`.
- **API:**
  - `POST /api/management/students` and `PATCH /api/management/students/:id` (GitHub link);
  - `POST /api/management/courses` and `POST /api/management/courses/:id/lessons`;
  - `PATCH /api/management/lessons/:id`;
  - `PUT /api/management/homework`.
- **AI tools:**
  - read: `list_course_lessons`, `list_homework`;
  - propose: `propose_student`, `propose_course`, `propose_lesson`, `propose_homework_review`.
