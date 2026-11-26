import type { NextRequest } from "next/server";

import { createApiSuccessResponse } from "@/lib/app-errors";
import { requireId } from "@/lib/validation";
import { assertSameOrigin, requireAuthenticatedUser, toApiErrorResponse } from "@/server/authz";
import { deleteStudyMaterial } from "@/server/study/service";

type RouteProps = { params: Promise<{ lessonId: string; materialId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteProps) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { lessonId, materialId } = await params;
    await deleteStudyMaterial(user, requireId(lessonId, "lessonId"), requireId(materialId, "materialId"));
    return createApiSuccessResponse({ deleted: true });
  } catch (error) {
    return toApiErrorResponse(error, { code: "material-delete-failed", message: "The file couldn't be deleted.", log: "study-material-delete" });
  }
}
