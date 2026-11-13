import { redirect } from "next/navigation";

import { requireTeacher } from "@/server/workspace";

/**
 * The Teacher Workspace opens on My students (the homework-checking workflow, docs/ERA_TEACHER_HOMEWORK.md).
 * The earlier dashboard still exists at /teacher/overview.
 */
export default async function TeacherHomePage() {
  await requireTeacher("/teacher");
  redirect("/teacher/my-students");
}
