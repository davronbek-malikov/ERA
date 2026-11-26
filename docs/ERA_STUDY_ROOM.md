# ERA Study Room (lesson study guides)

**Audience:** engineers working on ERA and the person deploying it.

## What it does

For every lesson, the teacher uploads the lesson's materials. ERA writes a **study guide** with AI, the teacher
reviews and edits it, then publishes it. Every student of the course then studies the same guide.

| Part | What the student gets |
|---|---|
| Left side | The full lesson, in sections, with 2 **checkpoint** questions after each section |
| Summary | A briefing, learning outcomes, key points and key terms (written once, saved, no tokens per student) |
| Ask a question | Type a question, or select text in the lesson and press "Ask about this". The answer comes from this lesson |
| Test yourself | 5 easy and 5 medium (multiple choice, graded instantly), and 5 advanced interview questions (written answers graded by AI, with one follow-up question) |

The guide is in **Uzbek by default**. Students can switch to English; their choice is remembered in the
`era_study_lang` cookie.

## Selection toolbar (highlights and notes)

Selecting text in the lesson opens a toolbar (`src/components/study/selection-toolbar.tsx`):

| Button | What it does |
|---|---|
| ✨ Tushuntirib ber (Explain this concept) | Opens the Ask tab with an AI explanation of the selected text, based on this lesson. Explanations of short selections (300 characters or less) are cached per lesson and language, so the same term costs tokens once |
| ● color · Belgilash (Highlight) | Saves a highlight in yellow, green, blue or pink |
| Izoh (Add note) | Saves a highlight with the student's own note |
| Savol (Ask) | Puts the selection into the Ask box |
| Nusxa (Copy) / 🔗 (Link) | Copies the text, or a link that opens the page at that text (URL text fragment) |

- **Stored per student.** Highlights and notes are private (`study_annotations`): only the student who made them can see, change or delete them. Teachers can't.
- **How a highlight is found again.** It is saved as `{ sectionId, start, quote }`, where `start` is the quote's offset in the section's text.
- **How it is drawn.** With the CSS Custom Highlight API, so the lesson's DOM is never changed. Notes get a dotted underline.
- **Clicking a highlight** opens a popover: change the color, edit the note, explain, or delete.
- **Notes tab.** "Izohlar" lists every highlight and note in lesson order, with "Ko'rsatish" (show), edit and delete.

## Pages and API

| Who | Page / route | Purpose |
|---|---|---|
| Teacher | `/teacher/study` | Every lesson of the teacher's courses, with the state of its guide |
| Teacher | `/teacher/study/[lessonId]` | 1. upload files · 2. generate · 3. review/edit (uz/en) · 4. publish · 5. results |
| Student | `/learn/courses/[course]/lessons/[lesson]/study` | The study room. The lesson page links to it once the guide is published |
| API | `POST /api/teacher/study/[lessonId]/materials` | Register an uploaded file (signed upload to `knowledge-documents` first); only its text is kept |
| API | `DELETE /api/teacher/study/[lessonId]/materials/[id]` | Remove a file |
| API | `POST /api/teacher/study/[lessonId]/generate` `{step}` | `chapter` → `questions` → `english` (one request each, up to 300 s) |
| API | `PUT /api/teacher/study/[lessonId]/guide` `{language, content}` | Save edits. The guide goes back to draft |
| API | `POST /api/teacher/study/[lessonId]/publish` `{publish}` | Publish or unpublish. Also clears the answer cache |
| API | `POST /api/learn/study/[lessonId]/ask` | Smart search, then the cache, then AI |
| API | `POST /api/learn/study/[lessonId]/answer` | Grade one answer |
| API | `POST /api/learn/study/[lessonId]/annotations`; `PATCH`/`DELETE …/annotations/[id]` | The student's own highlights and notes |

## Rules

- **Access**
  - Teacher endpoints: only the lesson's own teacher, or an admin. Other teachers get 404 (`courseScope`).
  - Students: the same rule as the classroom (enrollment + access). The guide must be `PUBLISHED`.
  - Teachers and admins see a draft only in preview mode.
- **Answers stay on the server.** Correct options, explanations and model answers are never sent before the student answers (`publicContent`).
- **Translation can't change answers.** The English version keeps the correct-answer indexes of the reviewed Uzbek guide.
- **Everything is validated.** Model output goes through `normalizeContent`: unknown fields are dropped and text is capped.
- **Audit log:** every teacher action is recorded (`study.*`).

## Saving tokens

1. **Generate once.** The guide is made once per lesson and shared by all students.
2. **Smart search (BM25, no AI)** picks at most 4 passages (about 3,600 characters) from the guide and the materials. Only those are sent to the AI, never the whole lesson.
3. **Answer cache.** The same question (ignoring case and punctuation) is answered from `study_ask_cache` without calling the AI. Questions about selected text are not cached.
4. **Limits.**
   - Per-user daily AI limits apply (`ERA_AI_DAILY_*`).
   - Rate limits: 20 questions per 10 minutes, 80 answers per 10 minutes, 40 generation steps per hour.

## AI providers and automatic switching

`ERA_LLM_PROVIDER` is used first. When it is out of tokens, rate limited, down, or its key is wrong, ERA switches
to the next provider automatically:

- **Order:** by default, every other provider that has a key, in the order Anthropic → OpenAI → Gemini → Groq.
- **Custom order:** `ERA_LLM_FALLBACKS="openai,gemini,groq"`.
- **Off:** `ERA_LLM_FALLBACKS=none`.
- **After a failure:** the failed provider is skipped for a few minutes.
- **Never retried:** a refusal or a cancellation.

| Provider | Key | Model (fallback default; override) |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `claude-opus-5-5` (`ERA_MODEL_ANTHROPIC`) |
| OpenAI | `OPENAI_API_KEY` | `gpt-4.1-mini` (`ERA_MODEL_OPENAI`) |
| Gemini | `GEMINI_API_KEY` | `gemini-2.5-flash` (`ERA_MODEL_GEMINI`), via Google's OpenAI-compatible API |
| Groq | `GROQ_API_KEY` | `openai/gpt-oss-120b` (`ERA_MODEL_GROQ`) |

The primary provider's model is still `ERA_MODEL_NAME`, when it is set. Groq's free plan can't hold a whole
lesson, so generation simply moves on to the next provider.

## Data (migration `12_lesson_study_room`)

All four tables have row level security enabled, like every ERA table.

| Table | Contents |
|---|---|
| `lesson_study_materials` | The extracted text of the uploaded files |
| `lesson_study_guides` | One per lesson: status, `content_uz`, `content_en` (JSON) |
| `study_attempts` | Each answer a student gave |
| `study_ask_cache` | Answered questions per lesson and language |

## Tests

`tests/security/management.test.mjs`, "Lesson study room", covers:

- access by another teacher, a student, or a visitor who isn't signed in
- the upload → 3 steps → draft → publish flow
- answers not leaking into the page
- choice and interview grading
- the answer cache (one AI call for two identical questions)
- editing returning the guide to draft

Provider switching is covered in `tests/security/ai-adapters.test.ts`.
