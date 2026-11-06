/**
 * ERA security regression suite (Prompt 07). Runs against a production build started by
 * tests/security/run.mjs with an isolated local database and fake storage/LLM services.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import {
  actionWithFields,
  allActionIds,
  anonymous,
  as,
  assertNoLeak,
  call,
  fx,
  get,
  invokeAction,
  post,
  resetStorageLog,
  STORAGE,
  storageLog
} from "./helpers.mjs";

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

const { users: u, courses: c, lessons: l, materials: m, exercises: e } = fx;
const student = as(u.studentA);
const otherStudent = as(u.studentB);
const outsider = as(u.studentC);
const teacherA = as(u.teacherA);
const teacherB = as(u.teacherB);
const teacherNoProfile = as(u.teacherNoProfile);
const admin = as(u.admin);

const chat = (session, body) => post("/api/era/chat", { session, json: body });
const progress = (session, slug, body) => post(`/api/courses/${slug}/progress`, { session, json: body });
const practiceBody = { code: "function solve(a,b){return a+b}", language: "javascript", results: [{ passed: true, actual: 3 }] };
const isRedirect = (status) => [302, 303, 307, 308].includes(status);

function isSignInRedirect(response, nextPath) {
  if (!isRedirect(response.status) || !(response.location ?? "").includes("/sign-in")) return false;
  return !nextPath || new URL(response.location, "http://x").searchParams.get("next") === nextPath;
}

// ---------------------------------------------------------------------------------------------
describe("1. Authentication: signed out, expired, tampered, suspended", () => {
  const protectedApis = [
    ["POST", "/api/era/chat", { lessonId: "x", question: "hi" }],
    ["GET", "/api/era/history?lesson_id=abc"],
    ["GET", `/api/lesson/${l.lessonA1.id}/context`],
    ["GET", `/api/materials/${m.materialA1.id}/download`],
    ["POST", "/api/admin/storage/upload", { filename: "a.pdf", contentType: "application/pdf", folder: "lesson-materials", fileSize: 10 }],
    ["POST", "/api/admin/storage/delete", { path: "users/x/lesson-materials/2026-11/a.pdf" }],
    ["POST", "/api/courses/course-a/progress", { lessonId: "abc" }],
    ["POST", "/api/courses/course-a/reviews", { rating: 5, comment: "great course" }],
    ["POST", `/api/practice/${e.exerciseA1}/submit`, practiceBody]
  ];

  for (const [method, url, json] of protectedApis) {
    test(`signed out ${method} ${url.split("?")[0]} → 401`, async () => {
      const response = await call(method, url, { session: anonymous, json });
      assert.equal(response.status, 401, response.text);
      assert.equal(response.data?.ok, false);
    });
  }

  for (const [label, session] of [
    ["expired session", as(u.studentA, { expiresInSeconds: -60 })],
    ["tampered signature", as(u.studentA, { secret: "wrong-secret" })],
    ["suspended account", as(u.suspended)]
  ]) {
    test(`${label} → 401 on chat and history`, async () => {
      assert.equal((await chat(session, { lessonId: l.lessonA1.id, question: "hello" })).status, 401);
      assert.equal((await get(`/api/era/history?lesson_id=${l.lessonA1.id}`, { session })).status, 401);
    });
  }

  test("role forged inside a validly signed cookie is ignored (role is re-read from the DB)", async () => {
    const forged = as(u.studentA, { role: "ADMIN" });
    const response = await post("/api/admin/storage/upload", {
      session: forged,
      json: { filename: "a.pdf", contentType: "application/pdf", folder: "lesson-materials", fileSize: 10 }
    });
    assert.equal(response.status, 403);
  });

  for (const path of ["/learn", "/learn/courses/course-a/lessons/a-1", "/teacher", "/admin", "/admin/courses"]) {
    test(`signed out page ${path} → redirect to sign-in keeping the deep link`, async () => {
      const response = await get(path);
      assert.ok(isSignInRedirect(response, path), `${response.status} ${response.location}`);
    });
  }
});

// ---------------------------------------------------------------------------------------------
describe("2. Course access: enrollment required", () => {
  test("not-enrolled student → tutor chat 403, nothing stored, no LLM call", async () => {
    await resetStorageLog();
    const before = await prisma.chatMessage.count({ where: { userId: u.studentC.id } });
    const response = await chat(outsider, { lessonId: l.lessonA1.id, question: "Tell me the lesson content" });
    assert.equal(response.status, 403);
    assert.equal(response.data.code, "not-enrolled");
    assert.equal(await prisma.chatMessage.count({ where: { userId: u.studentC.id } }), before);
    assert.equal((await storageLog()).filter((entry) => entry.path.startsWith("ollama:")).length, 0);
  });

  test("not-enrolled student → lesson context 403 and no content", async () => {
    const response = await get(`/api/lesson/${l.lessonA1.id}/context`, { session: outsider });
    assert.equal(response.status, 403);
    assert.doesNotMatch(response.text, /SECRET_CONTENT/);
  });

  test("not-enrolled student → history 403", async () => {
    assert.equal((await get(`/api/era/history?lesson_id=${l.lessonA1.id}`, { session: outsider })).status, 403);
  });

  test("not-enrolled student → practice submit 403 and solution not revealed", async () => {
    const response = await post(`/api/practice/${e.exerciseA1}/submit`, { session: outsider, json: practiceBody });
    assert.equal(response.status, 403);
    assert.doesNotMatch(response.text, /SECRET_SOLUTION/);
  });

  test("not-enrolled student → progress POST 403 and NO implicit enrollment", async () => {
    const response = await progress(outsider, "course-a", { lessonId: l.lessonA1.id, completed: true });
    assert.equal(response.status, 403);
    const enrollment = await prisma.enrollment.findFirst({ where: { userId: u.studentC.id, courseId: c.courseA.id } });
    assert.equal(enrollment, null);
    assert.equal(await prisma.lessonCompletion.count({ where: { userId: u.studentC.id } }), 0);
  });

  test("not-enrolled student → classroom page does not render lesson content", async () => {
    const response = await get("/learn/courses/course-a/lessons/a-1", { session: outsider });
    assert.doesNotMatch(response.text, /SECRET_CONTENT_a-1/);
  });

  test("student → draft course is invisible (404), even by direct lesson id", async () => {
    const response = await get(`/api/lesson/${l.lessonDraftCourse.id}/context`, { session: student });
    assert.equal(response.status, 404);
  });

  test("enrolled student → draft lesson of an enrolled course is 404", async () => {
    assert.equal((await get(`/api/lesson/${l.lessonA2Draft.id}/context`, { session: student })).status, 404);
    assert.equal((await chat(student, { lessonId: l.lessonA2Draft.id, question: "hi" })).status, 404);
  });

  test("enrolled student → context 200 with a signed (not public) video URL", async () => {
    const response = await get(`/api/lesson/${l.lessonA1.id}/context`, { session: student });
    assert.equal(response.status, 200);
    assert.match(response.data.lesson.lessonVideoUrl, /\/object\/sign\/course-videos\/.*token=signed-14400/);
    assert.doesNotMatch(response.data.lesson.lessonVideoUrl, /\/object\/public\//);
  });

  test("enrolled student → practice submit 200 (legitimate workflow)", async () => {
    const response = await post(`/api/practice/${e.exerciseA1}/submit`, { session: student, json: practiceBody });
    assert.equal(response.status, 200, response.text);
    assert.equal(response.data.status, "PASSED");
  });

  test("enrolled student → practice submit for another course's exercise 403", async () => {
    const response = await post(`/api/practice/${e.exerciseB1}/submit`, { session: student, json: practiceBody });
    assert.equal(response.status, 403);
    assert.doesNotMatch(response.text, /SECRET_SOLUTION/);
  });
});

// ---------------------------------------------------------------------------------------------
describe("3. Tutor chat and conversations", () => {
  test("enrolled student → chat 200; timestamp validated and composed on the server", async () => {
    const response = await chat(student, { lessonId: l.lessonA1.id, question: "What is a tensor?", timestampSeconds: 75 });
    assert.equal(response.status, 200, response.text);
    assert.equal(response.data.messages[0].content, "What is a tensor?\n\n(Asked at 1:15 in the lesson video.)");
    assert.match(response.data.answer, /Fake tutor answer/);
  });

  test("student → another student's conversation is never returned", async () => {
    const response = await get(`/api/era/history?lesson_id=${l.lessonA1.id}`, { session: student });
    assert.equal(response.status, 200);
    assert.doesNotMatch(response.text, /STUDENT_B_PRIVATE_QUESTION/);
    const own = await get(`/api/era/history?lesson_id=${l.lessonA1.id}`, { session: otherStudent });
    assert.match(own.text, /STUDENT_B_PRIVATE_QUESTION/);
  });

  test("client-supplied userId in the chat body is ignored", async () => {
    const response = await chat(student, { lessonId: l.lessonA1.id, question: "who am I", userId: u.studentB.id });
    assert.equal(response.status, 200, response.text);
    const stored = await prisma.chatMessage.findUnique({ where: { id: response.data.messages[0].id } });
    assert.equal(stored.userId, u.studentA.id);
  });

  test("lesson/course mismatch → 404", async () => {
    const response = await chat(student, { lessonId: l.lessonA1.id, courseId: c.courseB.id, question: "hi" });
    assert.equal(response.status, 404);
  });

  test("teachers and admins cannot use the student tutor", async () => {
    assert.equal((await chat(teacherA, { lessonId: l.lessonA1.id, question: "hi" })).status, 403);
    assert.equal((await chat(admin, { lessonId: l.lessonA1.id, question: "hi" })).status, 403);
  });

  for (const [label, body] of [
    ["empty question", { lessonId: "LID", question: "   " }],
    ["question too long", { lessonId: "LID", question: "x".repeat(3001) }],
    ["question not a string", { lessonId: "LID", question: { $gt: "" } }],
    ["negative timestamp", { lessonId: "LID", question: "hi", timestampSeconds: -1 }],
    ["fractional timestamp", { lessonId: "LID", question: "hi", timestampSeconds: 1.5 }],
    ["huge timestamp", { lessonId: "LID", question: "hi", timestampSeconds: 10 ** 9 }],
    ["path-like lesson id", { lessonId: "../../etc/passwd", question: "hi" }],
    ["missing lesson id", { question: "hi" }]
  ]) {
    test(`invalid chat body: ${label} → 400`, async () => {
      const json = JSON.parse(JSON.stringify(body).replace("LID", l.lessonA1.id));
      const response = await chat(student, json);
      assert.equal(response.status, 400, response.text);
      assert.equal(response.data.ok, false);
    });
  }

  test("non-JSON and non-object bodies → 400; oversized body → 413", async () => {
    const headers = { "content-type": "application/json" };
    assert.equal((await post("/api/era/chat", { session: student, body: "not json", headers })).status, 400);
    assert.equal((await post("/api/era/chat", { session: student, body: "[1,2]", headers })).status, 400);
    assert.equal((await post("/api/era/chat", { session: student, body: JSON.stringify({ q: "x".repeat(40_000) }), headers })).status, 413);
  });

  test("provider failure → generic 503 without internal details", async () => {
    const response = await chat(student, { lessonId: l.lessonA1.id, question: "FORCE_PROVIDER_FAILURE please" });
    assert.equal(response.status, 503);
    assert.equal(response.data.error, "ERA is temporarily unavailable. Please try again in a moment.");
    assertNoLeak(assert, response.text, "chat");
  });

  test("cross-origin POST → 403 (CSRF defence in depth)", async () => {
    const response = await post("/api/era/chat", {
      session: student,
      json: { lessonId: l.lessonA1.id, question: "hi" },
      headers: { origin: "https://evil.example" }
    });
    assert.equal(response.status, 403);
    assert.equal(response.data.code, "cross-origin");
  });
});

// ---------------------------------------------------------------------------------------------
describe("4. Progress, enrollment and reviews", () => {
  test("enrolled student → completes own lesson (200)", async () => {
    const response = await progress(student, "course-a", { lessonId: l.lessonA1.id, completed: true });
    assert.equal(response.status, 200, response.text);
    assert.deepEqual(response.data.completedLessonIds, [l.lessonA1.id]);
    assert.equal(response.data.currentLessonId, l.lessonA1.id);
  });

  test("student cannot modify another student's progress (userId in body ignored)", async () => {
    const beforeB = await prisma.lessonCompletion.count({ where: { userId: u.studentB.id } });
    const response = await progress(student, "course-a", { lessonId: l.lessonA1.id, completed: false, userId: u.studentB.id });
    assert.equal(response.status, 200);
    assert.equal(await prisma.lessonCompletion.count({ where: { userId: u.studentB.id } }), beforeB);
  });

  test("lesson from another course → 400", async () => {
    assert.equal((await progress(student, "course-a", { lessonId: l.lessonB1.id, completed: true })).status, 400);
  });

  test("currentLessonId from another course → 400 and resume position unchanged", async () => {
    const before = await prisma.enrollment.findFirst({ where: { userId: u.studentA.id, courseId: c.courseA.id } });
    assert.equal((await progress(student, "course-a", { currentLessonId: l.lessonB1.id })).status, 400);
    const afterRow = await prisma.enrollment.findFirst({ where: { userId: u.studentA.id, courseId: c.courseA.id } });
    assert.equal(afterRow.currentLessonId, before.currentLessonId);
  });

  test("draft lesson id → 400", async () => {
    assert.equal((await progress(student, "course-a", { lessonId: l.lessonA2Draft.id, completed: true })).status, 400);
  });

  test("invalid values → 400", async () => {
    assert.equal((await progress(student, "course-a", { lessonId: l.lessonA1.id, completed: "yes" })).status, 400);
    assert.equal((await progress(student, "course-a", {})).status, 400);
    assert.equal((await progress(student, "course-a", { lessonId: { $ne: null } })).status, 400);
  });

  test("teacher → progress POST 403", async () => {
    assert.equal((await progress(teacherA, "course-a", { lessonId: l.lessonA1.id, completed: true })).status, 403);
  });

  test("reviews: not-enrolled student 403, teacher 403, over-long comment 400, enrolled student 200", async () => {
    const body = { rating: 5, comment: "Very clear lessons." };
    assert.equal((await post("/api/courses/course-a/reviews", { session: outsider, json: body })).status, 403);
    assert.equal((await post("/api/courses/course-a/reviews", { session: teacherB, json: body })).status, 403);
    assert.equal(
      (await post("/api/courses/course-a/reviews", { session: student, json: { rating: 5, comment: "x".repeat(2001) } })).status,
      400
    );
    assert.equal((await post("/api/courses/course-a/reviews", { session: student, json: body })).status, 200);
  });

  test("enroll API still lets a student self-enroll in a published course (legitimate workflow)", async () => {
    const response = await post("/api/courses/course-b/enroll", { session: outsider });
    assert.equal(response.status, 200, response.text);
    assert.equal(response.data.enrolled, true);
    assert.equal((await post("/api/courses/course-a-draft/enroll", { session: outsider })).status, 404);
  });

  test("view counter is de-duplicated per client and course", async () => {
    const first = await post("/api/courses/course-b/view", { headers: { "x-forwarded-for": "203.0.113.9" } });
    const second = await post("/api/courses/course-b/view", { headers: { "x-forwarded-for": "203.0.113.9" } });
    assert.equal(first.data.tracked, true);
    assert.equal(second.data.tracked, false);
  });
});

// ---------------------------------------------------------------------------------------------
describe("5. Private materials and storage", () => {
  test("unauthorized material download: anonymous 401, outsider 403, other teacher 404, no signing", async () => {
    await resetStorageLog();
    assert.equal((await get(`/api/materials/${m.materialA1.id}/download`)).status, 401);
    assert.equal((await get(`/api/materials/${m.materialA1.id}/download`, { session: outsider })).status, 403);
    assert.equal((await get(`/api/materials/${m.materialA1.id}/download`, { session: teacherB })).status, 404);
    assert.equal((await get(`/api/materials/${m.materialCourseB.id}/download`, { session: student })).status, 403);
    assert.equal((await storageLog()).filter((entry) => entry.path.includes("/object/sign/")).length, 0);
  });

  test("enrolled student → authorized material: 302 to a 5-minute signed URL, not cached", async () => {
    const response = await get(`/api/materials/${m.materialA1.id}/download`, { session: student });
    assert.equal(response.status, 302);
    assert.ok(response.location.startsWith(`${STORAGE}/storage/v1/object/sign/course-videos/users/`), response.location);
    assert.match(response.location, /token=signed-300$/);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  });

  test("owner teacher and admin can download; external links pass through", async () => {
    assert.equal((await get(`/api/materials/${m.materialA1.id}/download`, { session: teacherA })).status, 302);
    const external = await get(`/api/materials/${m.materialCourseB.id}/download`, { session: admin });
    assert.equal(external.status, 302);
    assert.equal(external.location, "https://example.com/syllabus.pdf");
  });

  test("invalid material id → 404", async () => {
    assert.equal((await get("/api/materials/..%2F..%2Fetc/download", { session: student })).status, 404);
    assert.equal((await get("/api/materials/doesnotexist/download", { session: student })).status, 404);
  });

  test("classroom HTML never contains permanent storage URLs for materials or videos", async () => {
    const response = await get("/learn/courses/course-a/lessons/a-1", { session: student });
    assert.equal(response.status, 200);
    assert.match(response.text, new RegExp(`/api/materials/${m.materialA1.id}/download`));
    assert.doesNotMatch(response.text, /\/storage\/v1\/object\/public\//);
  });

  const upload = (session, body) => post("/api/admin/storage/upload", { session, json: body });

  test("upload: student 403", async () => {
    const body = { filename: "a.pdf", contentType: "application/pdf", folder: "lesson-materials", fileSize: 100 };
    assert.equal((await upload(student, body)).status, 403);
  });

  for (const [label, body] of [
    ["SVG image", { filename: "logo.svg", contentType: "image/svg+xml", folder: "course-thumbnails", fileSize: 100 }],
    ["executable", { filename: "setup.exe", contentType: "application/x-msdownload", folder: "lesson-materials", fileSize: 100 }],
    ["double extension executable", { filename: "notes.pdf.exe", contentType: "application/pdf", folder: "lesson-materials", fileSize: 100 }],
    ["HTML file", { filename: "page.html", contentType: "text/html", folder: "lesson-materials", fileSize: 100 }],
    ["MIME/extension mismatch", { filename: "notes.pdf", contentType: "video/mp4", folder: "lesson-materials", fileSize: 100 }],
    ["archive as thumbnail", { filename: "a.zip", contentType: "application/zip", folder: "course-thumbnails", fileSize: 100 }],
    ["oversized material", { filename: "big.pdf", contentType: "application/pdf", folder: "lesson-materials", fileSize: 26 * 1024 * 1024 }],
    ["unknown folder", { filename: "a.pdf", contentType: "application/pdf", folder: "../users", fileSize: 100 }],
    ["path in filename", { filename: "../../a.pdf", contentType: "application/pdf", folder: "lesson-materials", fileSize: 100 }],
    ["zero size", { filename: "a.pdf", contentType: "application/pdf", folder: "lesson-materials", fileSize: 0 }]
  ]) {
    test(`upload validation: ${label} → 400`, async () => {
      const response = await upload(teacherA, body);
      assert.equal(response.status, 400, response.text);
    });
  }

  test("upload: valid material → user-scoped path in the private bucket, never overwrites", async () => {
    await resetStorageLog();
    const body = { filename: "Week 1 notes.pdf", contentType: "application/pdf", folder: "lesson-materials", fileSize: 1000 };
    const response = await upload(teacherA, body);
    assert.equal(response.status, 200, response.text);
    assert.ok(response.data.path.startsWith(`users/${u.teacherA.id}/lesson-materials/`));
    assert.equal(response.data.visibility, "private");
    const sign = (await storageLog()).find((entry) => entry.path.includes("/object/upload/sign/"));
    assert.equal(sign.upsert, "false");
    assert.ok(sign.path.includes("/course-videos/"));
  });

  test("upload: thumbnails go to the public bucket", async () => {
    const response = await upload(teacherA, { filename: "cover.png", contentType: "image/png", folder: "course-thumbnails", fileSize: 1000 });
    assert.equal(response.status, 200);
    assert.match(response.data.publicUrl, /\/object\/public\/public-assets\//);
  });

  test("storage delete: teacher cannot delete another user's object or traverse paths", async () => {
    const otherPath = m.materialB1.storagePath;
    assert.equal((await post("/api/admin/storage/delete", { session: teacherA, json: { path: otherPath } })).status, 403);
    const traversal = `users/${u.teacherA.id}/../${u.teacherB.id}/x.pdf`;
    assert.equal((await post("/api/admin/storage/delete", { session: teacherA, json: { path: traversal } })).status, 400);
    assert.equal((await post("/api/admin/storage/delete", { session: teacherA, json: { path: "course-videos/anything" } })).status, 400);
  });
});

// ---------------------------------------------------------------------------------------------
describe("6. Teacher isolation and studio server actions", () => {
  let coursesHtmlB = "";
  let editCourseHtmlB = "";
  let materialsHtmlB = "";
  before(async () => {
    coursesHtmlB = (await get("/admin/courses", { session: teacherB })).text;
    // The edit form only renders for ?edit=<own course id>; its action id is the update action.
    editCourseHtmlB = (await get(`/admin/courses?edit=${c.courseB.id}`, { session: teacherB })).text;
    materialsHtmlB = (await get("/admin/materials", { session: teacherB })).text;
  });

  test("teacher B cannot open teacher A's course in the editor", async () => {
    const response = await get(`/admin/courses?edit=${c.courseA.id}`, { session: teacherB });
    assert.doesNotMatch(response.text, /Edit Course: Course course-a/);
  });

  test("teacher B's studio lists only their own courses", async () => {
    assert.match(coursesHtmlB, /Course course-b/);
    assert.doesNotMatch(coursesHtmlB, /Course course-a/);
  });

  test("teacher without a profile sees no courses, lessons, materials or student progress", async () => {
    for (const page of ["/admin/courses", "/admin/lessons", "/admin/materials", "/admin/progress"]) {
      const response = await get(page, { session: teacherNoProfile });
      assert.equal(response.status, 200, page);
      assert.doesNotMatch(response.text, /Course course-[ab]|Lesson a-1|A1 notes|student-a@security\.test/, page);
    }
  });

  test("teacher → another teacher's course in the lesson context API → 404", async () => {
    assert.equal((await get(`/api/lesson/${l.lessonA1.id}/context`, { session: teacherB })).status, 404);
  });

  test("teacher A previews own draft lesson (allowed)", async () => {
    assert.equal((await get(`/api/lesson/${l.lessonA2Draft.id}/context`, { session: teacherA })).status, 200);
  });

  test("teacher B cannot update teacher A's course through the server action", async () => {
    const actionId = actionWithFields(editCourseHtmlB, ["id", "title", "categoryId"]);
    assert.ok(actionId, "update course action id found");
    const response = await invokeAction(
      "/admin/courses",
      actionId,
      { id: c.courseA.id, title: "HIJACKED", categoryId: fx.categoryId, status: "PUBLISHED" },
      teacherB
    );
    assert.ok(isRedirect(response.status) || response.status === 200, String(response.status));
    const course = await prisma.course.findUnique({ where: { id: c.courseA.id } });
    assert.equal(course.title, "Course course-a");
  });

  test("teacher B cannot delete teacher A's course", async () => {
    const ids = allActionIds(coursesHtmlB);
    assert.ok(ids.length > 0, "course page actions found");
    for (const actionId of ids) await invokeAction("/admin/courses", actionId, { id: c.courseA.id }, teacherB);
    assert.ok(await prisma.course.findUnique({ where: { id: c.courseA.id } }));
  });

  test("teacher without profile cannot update any course", async () => {
    const actionId = actionWithFields(editCourseHtmlB, ["id", "title", "categoryId"]);
    await invokeAction("/admin/courses", actionId, { id: c.courseB.id, title: "NOPROFILE", categoryId: fx.categoryId }, teacherNoProfile);
    assert.equal((await prisma.course.findUnique({ where: { id: c.courseB.id } })).title, "Course course-b");
  });

  test("teacher B cannot delete teacher A's material nor trigger deletion of A's stored file", async () => {
    await resetStorageLog();
    const ids = allActionIds(materialsHtmlB);
    assert.ok(ids.length > 0, "material page actions found");
    for (const actionId of ids) await invokeAction("/admin/materials", actionId, { id: m.materialA1.id }, teacherB);
    assert.ok(await prisma.courseMaterial.findUnique({ where: { id: m.materialA1.id } }));
    assert.equal((await storageLog()).filter((entry) => entry.method === "DELETE").length, 0);
  });

  test("teacher B cannot attach teacher A's stored file to their own material (storage IDOR)", async () => {
    const actionId = actionWithFields(materialsHtmlB, ["courseId", "title", "fileUrl"], ["id"]);
    assert.ok(actionId, "create material action id found");
    const before = await prisma.courseMaterial.count();
    await invokeAction(
      "/admin/materials",
      actionId,
      { courseId: c.courseB.id, lessonId: l.lessonB1.id, title: "stolen", fileUrl: m.materialA1.fileUrl, storagePath: m.materialA1.storagePath },
      teacherB
    );
    assert.equal(await prisma.courseMaterial.count(), before);
  });

  test("material with a javascript: URL is refused", async () => {
    const actionId = actionWithFields(materialsHtmlB, ["courseId", "title", "fileUrl"], ["id"]);
    const before = await prisma.courseMaterial.count();
    await invokeAction("/admin/materials", actionId, { courseId: c.courseB.id, title: "xss", fileUrl: "javascript:alert(1)" }, teacherB);
    assert.equal(await prisma.courseMaterial.count(), before);
  });

  test("teacher B can add a material with their own external link (legitimate workflow)", async () => {
    const actionId = actionWithFields(materialsHtmlB, ["courseId", "title", "fileUrl"], ["id"]);
    const before = await prisma.courseMaterial.count();
    await invokeAction("/admin/materials", actionId, { courseId: c.courseB.id, title: "Reading list", fileUrl: "https://example.com/reading" }, teacherB);
    assert.equal(await prisma.courseMaterial.count(), before + 1);
  });

  test("instructor cannot set homepage merchandising flags", async () => {
    const actionId = actionWithFields(editCourseHtmlB, ["id", "title", "categoryId"]);
    await invokeAction(
      "/admin/courses",
      actionId,
      { id: c.courseB.id, title: "Course course-b", categoryId: fx.categoryId, status: "PUBLISHED", isFeatured: "on", isPopular: "on" },
      teacherB
    );
    const course = await prisma.course.findUnique({ where: { id: c.courseB.id } });
    assert.equal(course.isFeatured, false);
    assert.equal(course.isPopular, false);
  });

  test("teacher B can still update their own course (legitimate workflow)", async () => {
    const actionId = actionWithFields(editCourseHtmlB, ["id", "title", "categoryId"]);
    await invokeAction(
      "/admin/courses",
      actionId,
      { id: c.courseB.id, title: "Course course-b", subtitle: "Updated by owner", categoryId: fx.categoryId, status: "PUBLISHED" },
      teacherB
    );
    assert.equal((await prisma.course.findUnique({ where: { id: c.courseB.id } })).subtitle, "Updated by owner");
  });
});

// ---------------------------------------------------------------------------------------------
describe("7. Admin boundaries", () => {
  let usersHtml = "";
  before(async () => {
    usersHtml = (await get("/admin/users", { session: admin })).text;
  });

  test("teacher → admin users page is denied (no user list)", async () => {
    const response = await get("/admin/users", { session: teacherA });
    assert.doesNotMatch(response.text, /student-a@security\.test/);
  });

  test("admin → users page lists users without password hashes", async () => {
    assert.match(usersHtml, /student-a@security\.test/);
    assert.doesNotMatch(usersHtml, /\$2[aby]\$/);
  });

  test("teacher → admin-only create-user action is refused", async () => {
    const actionId = actionWithFields(usersHtml, ["name", "email", "password"]);
    assert.ok(actionId, "create user action id found");
    await invokeAction("/admin/users", actionId, { name: "Evil", email: "evil@security.test", password: "Password123!", role: "ADMIN" }, teacherA);
    assert.equal(await prisma.user.findUnique({ where: { email: "evil@security.test" } }), null);
  });

  test("admin cannot delete their own account", async () => {
    const ids = allActionIds(usersHtml);
    assert.ok(ids.length > 0, "users page actions found");
    for (const actionId of ids) await invokeAction("/admin/users", actionId, { id: u.admin.id }, admin);
    assert.ok(await prisma.user.findUnique({ where: { id: u.admin.id } }));
  });

  test("admin can delete another (non-last) admin account (legitimate workflow)", async () => {
    for (const actionId of allActionIds(usersHtml)) await invokeAction("/admin/users", actionId, { id: u.admin2.id }, admin);
    assert.equal(await prisma.user.findUnique({ where: { id: u.admin2.id } }), null);
  });

  test("admin → permitted resources are allowed", async () => {
    assert.equal((await get(`/api/lesson/${l.lessonB1.id}/context`, { session: admin })).status, 200);
    assert.equal((await get(`/api/materials/${m.materialB1.id}/download`, { session: admin })).status, 302);
    assert.equal((await get("/admin/users", { session: admin })).status, 200);
  });
});

// ---------------------------------------------------------------------------------------------
describe("8. Legacy lesson URL, direct URLs and headers", () => {
  test("legacy lesson URL redirects into the classroom and renders no lesson content", async () => {
    const response = await get("/courses/course-a/lessons/a-1");
    assert.ok(isRedirect(response.status), String(response.status));
    assert.equal(new URL(response.location, "http://x").pathname, "/learn/courses/course-a/lessons/a-1");
    assert.doesNotMatch(response.text, /SECRET_CONTENT/);
  });

  test("legacy URL for a signed-in enrolled student ends in the authorized classroom", async () => {
    const first = await get("/courses/course-a/lessons/a-1", { session: student });
    const second = await get(new URL(first.location, "http://x").pathname, { session: student });
    assert.equal(second.status, 200);
    assert.match(second.text, /SECRET_CONTENT_a-1/);
  });

  test("public course page shows the outline only: no lesson notes, video files, storage URLs, solutions or drafts", async () => {
    // Added in the Prompt 09 acceptance audit: the public page used to serialize full lessons into its HTML.
    for (const session of [undefined, as(u.studentC)]) {
      const response = await get("/courses/course-a", { session });
      assert.equal(response.status, 200);
      assert.match(response.text, /Lesson a-1/, "outline still shown");
      assert.doesNotMatch(response.text, /SECRET_CONTENT_|a1-video\.mp4|\/storage\/v1\/object|SECRET_SOLUTION|Lesson a-2-draft/);
    }
  });

  test("security headers are present", async () => {
    const response = await get("/");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  });
});
