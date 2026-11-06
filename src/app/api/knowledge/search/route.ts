import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { assertRateLimit, getUserRateLimitKeyParts } from "@/lib/rate-limit";
import { optionalId, readJsonObject, requireString } from "@/lib/validation";
import { assertSameOrigin, authErrors, requireAuthenticatedUser, toApiErrorResponse } from "@/server/authz";
import { retrieveKnowledge } from "@/server/knowledge/retrieval";

/**
 * "Test a question" for Knowledge Base managers: returns the passages ERA would retrieve for this user, with the same
 * authorization as the assistants. Teachers and admins only (students get retrieval through ERA Tutor).
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.INSTRUCTOR) {
      throw authErrors.forbidden("Only teachers and administrators can search the Knowledge Base.");
    }
    const body = await readJsonObject(request, 8 * 1024);
    const query = requireString(body.query, "query", { max: 1000 });
    const courseId = optionalId(body.courseId, "courseId");

    await assertRateLimit({ scope: "knowledge-search", maxAttempts: 30, windowMs: 60_000, cooldownMs: 60_000, keyParts: getUserRateLimitKeyParts(user.id) });

    const result = await retrieveKnowledge(user, query, { agent: user.role === UserRole.ADMIN ? "admin" : "teacher", courseId });
    if (result.status === "disabled") return createApiErrorResponse(503, "knowledge-disabled", "The Knowledge Base search isn't configured yet.");
    if (result.status === "error") {
      return createApiErrorResponse(503, "knowledge-unavailable", "The Knowledge Base search is temporarily unavailable.", { retryable: true });
    }
    return createApiSuccessResponse({
      passages: result.passages.map((passage) => ({ ...passage, content: passage.content.slice(0, 600) }))
    });
  } catch (error) {
    return toApiErrorResponse(error, { code: "knowledge-unavailable", message: "The Knowledge Base search is temporarily unavailable.", log: "knowledge-search" });
  }
}
