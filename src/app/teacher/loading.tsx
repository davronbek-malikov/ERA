import { WorkspacePage } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/feedback";

export default function TeacherLoading() {
  return (
    <WorkspacePage className="flex flex-col gap-6" >
      <div role="status" aria-label="Loading" className="flex flex-col gap-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </WorkspacePage>
  );
}
