import type { NextRequest } from "next/server";

import { createApiSuccessResponse } from "@/lib/app-errors";
import { invalid, readJsonObject, requireId } from "@/lib/validation";
import { decidePendingAction } from "@/server/ai/actions";
import { executeManagementAction } from "@/server/ai/management-tools";
import { assertSameOrigin, requireAuthenticatedUser, toApiErrorResponse } from "@/server/authz";
import { revalidateManagement } from "@/server/management/http";

type RouteProps = { params: Promise<{ actionId: string }> };

/**
 * Confirm or cancel an AI-proposed change (docs/ERA_STUDENT_MANAGEMENT.md, "AI assistant → Confirmation").
 * Body: { decision: "confirm" | "cancel" }. Only the user the proposal was made for can decide it; it runs at
 * most once, with that user's current permissions. Repeating a request returns the stored outcome.
 */
export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { actionId } = await params;
    const body = await readJsonObject(request, 4 * 1024);
    const decision = body.decision === "confirm" || body.decision === "cancel" ? body.decision : null;
    if (!decision) throw invalid("invalid-decision", "decision must be confirm or cancel.");

    const action = await decidePendingAction(user.id, requireId(actionId, "actionId"), decision, (pending) => executeManagementAction(user, pending));
    if (decision === "confirm") revalidateManagement();
    return createApiSuccessResponse({ action });
  } catch (error) {
    return toApiErrorResponse(error, { code: "action-unavailable", message: "The change couldn't be processed. Please try again.", log: "ai-actions" });
  }
}
