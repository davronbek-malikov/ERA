import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import { createApiSuccessResponse } from "@/lib/app-errors";
import { readJsonObject } from "@/lib/validation";
import { assertSameOrigin, toApiErrorResponse } from "@/server/authz";
import { requireManagementActor, type ManagementActor } from "@/server/management/actor";

/*
 * Shared plumbing for /api/management/* (docs/ERA_STUDENT_MANAGEMENT.md, "API").
 * Each route: same-origin check → JSON body (size-capped) → actor from the session → handler → JSON.
 * `workspace` ("admin" | "teacher") only matters for administrators, who can also act as a teacher.
 */

export type Workspace = "admin" | "teacher";

export function parseWorkspace(value: unknown): Workspace {
  return value === "teacher" ? "teacher" : "admin";
}

const MANAGEMENT_PATHS = ["/admin/students", "/teacher/my-students", "/teacher/payments", "/teacher/schedule", "/learn/courses"];

export function revalidateManagement() {
  for (const path of MANAGEMENT_PATHS) revalidatePath(path, "layout");
}

type Handler = (context: { actor: ManagementActor; body: Record<string, unknown> }) => Promise<Record<string, unknown>>;

export async function handleManagementMutation(request: NextRequest, handler: Handler, options: { status?: number; bodyless?: boolean } = {}) {
  try {
    assertSameOrigin(request);
    const body = options.bodyless ? {} : await readJsonObject(request, 32 * 1024);
    const workspace = parseWorkspace(body.workspace ?? request.nextUrl.searchParams.get("workspace"));
    const actor = await requireManagementActor(workspace);
    const result = await handler({ actor, body });
    revalidateManagement();
    return createApiSuccessResponse(result, options.status ?? 200);
  } catch (error) {
    return toApiErrorResponse(error, {
      code: "management-unavailable",
      message: "Student management is temporarily unavailable. Please try again.",
      log: "management"
    });
  }
}

export async function handleManagementQuery(request: NextRequest, handler: (context: { actor: ManagementActor }) => Promise<Record<string, unknown>>) {
  try {
    const actor = await requireManagementActor(parseWorkspace(request.nextUrl.searchParams.get("workspace")));
    return createApiSuccessResponse(await handler({ actor }));
  } catch (error) {
    return toApiErrorResponse(error, {
      code: "management-unavailable",
      message: "Student management is temporarily unavailable. Please try again.",
      log: "management"
    });
  }
}
