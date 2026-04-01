import { demoCourses, demoEnrollments } from "@/lib/demo-data";

export type PublicMomentumEntry = {
  user: {
    name: string;
  };
  course: {
    title: string;
  };
  progress: number;
};

export function getPublicMomentumEntries(limit = 3): PublicMomentumEntry[] {
  return demoEnrollments
    .slice()
    .sort((a, b) => b.progress - a.progress)
    .slice(0, limit)
    .map((enrollment, index) => ({
      user: {
        name: `Learner ${String.fromCharCode(65 + index)}`
      },
      course: {
        title: demoCourses.find((course) => course.id === enrollment.courseId)?.title ?? "Course"
      },
      progress: Math.min(100, Math.max(15, Math.round(enrollment.progress / 10) * 10))
    }));
}
