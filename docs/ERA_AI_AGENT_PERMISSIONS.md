# ERA AI: Agent Permissions (Prompt 08)

These rules extend `docs/ERA_AUTHORIZATION_MATRIX.md`. They are enforced on the server in
`src/server/authz.ts`, `src/server/ai/access.ts`, `src/server/ai/contextual.ts` and, as defence in depth,
`src/server/ai/engine.ts`. The model is never trusted to enforce them.

## 1. Who can use which agent

| | Anonymous | Student | Teacher (with profile) | Teacher without profile | Admin |
|---|---|---|---|---|---|
| Student Tutor (`/api/era/chat`) | 401 | ✅ enrolled + published lesson | 403 | 403 | 403 |
| Teacher Assistant (`/api/ai/chat`, `agent: "teacher"`) | 401 | 403 | ✅ | 403 | ✅ only with a linked instructor profile |
| Admin Assistant (`agent: "admin"`) | 401 | 403 | 403 | 403 | ✅ |
| List / read Teacher or Admin conversations | 401 | 403 | Own only | 403 | Own only |

Identity and role always come from the session; the role is re-read from the database. Fields such as
`role`, `userId` or `teacherId` in a request body are ignored. A cookie whose role field was forged is ignored too.

## 2. What each agent may see

| Agent | Context that can enter the prompt | Never included |
|---|---|---|
| Student Tutor | The current lesson's overview, objectives, key points and notes; with Ask ERA AI, also assignment instructions or the material's title and description | Other courses or lessons, practice solutions, quiz answers, other students' messages, any personal data |
| Teacher Assistant | Outline of one course **owned by the teacher** (lesson titles, statuses, summaries, key points), re-checked on every message; with Ask ERA AI, the owned lesson's notes | Other teachers' courses, student names, emails or progress, private conversations |
| Admin Assistant | Aggregate counts: accounts per role, courses per status, enrollments, completions, AI request counts, and the course list with teacher display names and averages | Emails, phone numbers, password hashes, individual students' records, tutor conversations, credentials |

## 3. What agents can do

None of them can perform actions. There are no tools, no database access, no SQL and no publishing:
- The Teacher Assistant's output is labelled **"Draft — not published"**. Teachers add content through the course
  editor, which applies its own ownership checks.
- The Admin Assistant explains and points to admin pages. Every change goes through the existing admin actions,
  which require explicit confirmation and server-side permission checks.

## 4. Conversation ownership

- **Student Tutor:** messages are filtered by `userId` from the session and by the lesson. Lesson access is
  re-checked on every request, so losing enrollment hides the history.
- **Teacher and Admin:** `AiConversation.userId` must equal the session user and `agent` must match the endpoint.
  - Reading or continuing someone else's conversation returns **404**, so it is indistinguishable from a
    conversation that doesn't exist.
  - The check runs again inside the save transaction.

## 5. Limits

Limits apply on the server to every agent:
- burst per minute;
- daily requests per role;
- daily tokens per user.

See `ERA_AI_USAGE_TRACKING.md`.

## 6. Ask ERA AI sources

| Workspace | Source types | Authorization |
|---|---|---|
| Student | `lesson`, `assignment` (practice exercise), `reading` (lesson material) | `requireLessonAccess` on the source's lesson. The source must belong to the lesson thread the request joins. |
| Teacher | `lesson`, `course`, `documentation` | The lesson's or course's `instructorId` must be the teacher's profile |
| Admin | `lesson`, `report` (`analytics`, `overview`), `documentation` | Admin inspection of the lesson; report keys come from a fixed list |

Actions per workspace and source are defined in `src/lib/ai/ask-era.ts` and re-validated on the server. An action
that isn't offered for that source returns 400.
