import { requireSignedIn } from "@/server/workspace";

// Guard before the loading boundary, so signed-out visitors get a real redirect.
// Each page still decides access itself (students, or teacher preview and admin inspection).
export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  await requireSignedIn("/learn");
  return children;
}
