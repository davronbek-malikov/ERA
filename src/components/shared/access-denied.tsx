import { Lock } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";

type AccessDeniedProps = {
  title?: string;
  description?: string;
  /** The most useful next step: Enroll, Ask your teacher, Go to your dashboard. */
  action?: React.ReactNode;
};

/**
 * Shown when the server has refused access (403). It never decides access itself.
 * Use notFound() instead when the user mustn't learn that the record exists.
 */
export function AccessDenied({
  title = "You don't have access to this page",
  description = "If you think this is a mistake, contact your teacher or the ERA team.",
  action
}: AccessDeniedProps) {
  return <EmptyState icon={<Lock />} title={title} description={description} action={action} />;
}
