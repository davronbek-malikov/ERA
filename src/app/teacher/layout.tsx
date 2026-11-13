import { requireTeacher } from "@/server/workspace";

// Guard before the loading boundary, so signed-out visitors get a real redirect.
// Each page still checks access itself.
export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  await requireTeacher("/teacher");
  return children;
}
