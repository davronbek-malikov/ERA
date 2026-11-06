/**
 * Direct tests of the authorization core and validators (no HTTP). Uses the isolated local test DB
 * prepared by tests/security/run.mjs.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";

import { prisma } from "@/lib/prisma";
import { getInstructorRecordForUser } from "@/lib/permissions";
import { isSafeStoragePath, parseStorageObjectUrl, storagePathFolder, validateUpload } from "@/lib/storage";
import { isSafeHttpUrl, optionalInteger, requireId, RequestError } from "@/lib/validation";
import {
  AuthzError,
  getStudioScope,
  requireCourseAccess,
  requireLessonAccess,
  requireStudentEnrollment,
  requireTeacherCourseOwnership,
  resolveCourseAccess,
  studioCourseWhere,
  type AuthUser
} from "@/server/authz";

const fx = JSON.parse(readFileSync(path.join(process.cwd(), "tests", "security", ".state", "fixtures.json"), "utf8"));
const u = fx.users as Record<string, AuthUser>;
after(() => prisma.$disconnect());

async function rejectsWith(promise: Promise<unknown>, status: number) {
  await assert.rejects(promise, (error: unknown) => error instanceof AuthzError && error.status === status);
}

describe("authz: studio scope and ownership (fail closed)", () => {
  test("admin scope sees everything; instructor scope is their profile; no profile = none", async () => {
    assert.deepEqual(await getStudioScope(u.admin), { kind: "admin" });
    assert.deepEqual(await getStudioScope(u.teacherA), { kind: "instructor", instructorId: fx.instructors.instructorA });
    assert.deepEqual(await getStudioScope(u.teacherNoProfile), { kind: "none" });
    assert.deepEqual(await getStudioScope(u.studentA), { kind: "none" });
    assert.deepEqual(await getStudioScope(null), { kind: "none" });
    assert.equal(studioCourseWhere({ kind: "none" }), null);
  });

  test("requireTeacherCourseOwnership: owner ok, other teacher 404, no profile 403, student 403, admin ok, missing 404", async () => {
    assert.equal((await requireTeacherCourseOwnership(u.teacherA, fx.courses.courseA.id)).course.id, fx.courses.courseA.id);
    await rejectsWith(requireTeacherCourseOwnership(u.teacherB, fx.courses.courseA.id), 404);
    await rejectsWith(requireTeacherCourseOwnership(u.teacherNoProfile, fx.courses.courseA.id), 403);
    await rejectsWith(requireTeacherCourseOwnership(u.studentA, fx.courses.courseA.id), 403);
    assert.ok(await requireTeacherCourseOwnership(u.admin, fx.courses.courseB.id));
    await rejectsWith(requireTeacherCourseOwnership(u.admin, "doesnotexist"), 404);
  });

  test("instructor profile is never taken over by email when it is already linked", async () => {
    const impostor = { id: "impostor", email: u.teacherA.email.toUpperCase(), role: "INSTRUCTOR" };
    assert.equal(await getInstructorRecordForUser(impostor), null);
  });
});

describe("authz: learner access", () => {
  test("resolveCourseAccess: enrolled ok, not enrolled → not-enrolled, draft → not-found, other teacher → not-found", async () => {
    const course = { ...fx.courses.courseA };
    assert.deepEqual(await resolveCourseAccess(u.studentA, course), { status: "ok", mode: "student" });
    assert.equal((await resolveCourseAccess(u.studentC, course)).status, "not-enrolled");
    assert.equal((await resolveCourseAccess(u.studentA, fx.courses.courseDraft)).status, "not-found");
    assert.equal((await resolveCourseAccess(u.teacherB, course)).status, "not-found");
    assert.deepEqual(await resolveCourseAccess(u.teacherA, course), { status: "ok", mode: "teacher-preview" });
    assert.deepEqual(await resolveCourseAccess(u.admin, course), { status: "ok", mode: "admin-inspection" });
  });

  test("requireLessonAccess: course mismatch 404, studentsOnly blocks teachers, draft lesson 404 for students", async () => {
    assert.equal((await requireLessonAccess(u.studentA, fx.lessons.lessonA1.id)).mode, "student");
    await rejectsWith(requireLessonAccess(u.studentA, fx.lessons.lessonA1.id, { courseId: fx.courses.courseB.id }), 404);
    await rejectsWith(requireLessonAccess(u.teacherA, fx.lessons.lessonA1.id, { studentsOnly: true }), 403);
    await rejectsWith(requireLessonAccess(u.studentA, fx.lessons.lessonA2Draft.id), 404);
    await rejectsWith(requireLessonAccess(u.studentC, fx.lessons.lessonA1.id), 403);
    await rejectsWith(requireLessonAccess(u.studentA, "doesnotexist"), 404);
    assert.equal((await requireLessonAccess(u.teacherA, fx.lessons.lessonA2Draft.id)).mode, "teacher-preview");
  });

  test("requireCourseAccess and requireStudentEnrollment never create an enrollment", async () => {
    await rejectsWith(requireCourseAccess(u.studentC, fx.courses.courseA.id), 403);
    await rejectsWith(requireStudentEnrollment(u.studentC, fx.courses.courseA.id), 403);
    await rejectsWith(requireStudentEnrollment(u.teacherA, fx.courses.courseA.id), 403);
    assert.equal(await prisma.enrollment.count({ where: { userId: u.studentC.id, courseId: fx.courses.courseA.id } }), 0);
  });
});

describe("validation and storage helpers", () => {
  test("ids", () => {
    assert.equal(requireId(" abc_123 ", "id"), "abc_123");
    for (const bad of ["", "../x", "a/b", "a b", 42, null, "x".repeat(65), { $ne: 1 }]) {
      assert.throws(() => requireId(bad, "id"), RequestError);
    }
  });

  test("integers", () => {
    assert.equal(optionalInteger(undefined, "t", { min: 0, max: 10 }), undefined);
    assert.equal(optionalInteger(5, "t", { min: 0, max: 10 }), 5);
    for (const bad of [-1, 11, 1.5, "5", Number.NaN]) {
      assert.throws(() => optionalInteger(bad, "t", { min: 0, max: 10 }), RequestError);
    }
  });

  test("URLs", () => {
    assert.ok(isSafeHttpUrl("https://example.com/a.pdf"));
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.com/x", "/relative", "ftp://x/y", "notaurl"]) {
      assert.equal(isSafeHttpUrl(bad), false, bad);
    }
  });

  test("upload policy: allow-list per folder", () => {
    assert.equal(validateUpload("lesson-materials", "notes.pdf", "application/pdf", 100), null);
    assert.equal(validateUpload("lesson-materials", "data.csv", "application/vnd.ms-excel", 100), null);
    assert.equal(validateUpload("lesson-videos", "intro.mp4", "video/mp4", 100), null);
    assert.ok(validateUpload("course-thumbnails", "x.svg", "image/svg+xml", 100));
    assert.ok(validateUpload("lesson-materials", "x.exe", "application/octet-stream", 100));
    assert.ok(validateUpload("lesson-materials", "x.pdf.exe", "application/pdf", 100));
    assert.ok(validateUpload("lesson-materials", "x.js", "text/javascript", 100));
    assert.ok(validateUpload("course-thumbnails", "x.png", "text/html", 100));
    assert.ok(validateUpload("lesson-videos", "x.mp4", "video/mp4", 501 * 1024 * 1024));
    assert.ok(validateUpload("nope", "x.pdf", "application/pdf", 100));
  });

  test("storage paths: server-generated only", () => {
    assert.ok(isSafeStoragePath("users/abc123/lesson-materials/2026-11/uuid-notes.pdf"));
    for (const bad of [
      "users/abc/../def/lesson-materials/x.pdf",
      "/users/abc/lesson-materials/x.pdf",
      "course-videos/x.pdf",
      "users/abc//x.pdf",
      "users/abc/Lesson Materials/x.pdf",
      ""
    ]) {
      assert.equal(isSafeStoragePath(bad), false, bad);
    }
    assert.equal(storagePathFolder("users/abc/lesson-materials/2026-11/x.pdf"), "lesson-materials");
  });

  test("storage URL parsing recognises only ERA buckets", () => {
    const base = process.env.SUPABASE_URL;
    assert.deepEqual(parseStorageObjectUrl(`${base}/storage/v1/object/public/course-videos/users/a/lesson-videos/x.mp4`), {
      bucket: "course-videos",
      path: "users/a/lesson-videos/x.mp4"
    });
    assert.equal(parseStorageObjectUrl(`${base}/storage/v1/object/public/other-bucket/x.mp4`), null);
    assert.equal(parseStorageObjectUrl("https://www.youtube.com/watch?v=x"), null);
  });
});
