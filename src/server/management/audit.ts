import type { ManagementSource, Prisma } from "@prisma/client";

/*
 * Management audit trail (docs/ERA_STUDENT_MANAGEMENT.md, "Audit"). Every change made through the module —
 * manually, by a confirmed AI action or by the system — writes one row in the SAME database transaction as the
 * change itself, so a change without its audit row (or the reverse) can't exist.
 */

export type AuditEntry = {
  actorId: string | null;
  action: string;
  entityType: "enrollment" | "payment" | "exam" | "note" | "permission";
  entityId: string;
  before?: unknown;
  after?: unknown;
  source: ManagementSource;
};

/** Dates become ISO strings and undefined fields disappear, so the JSON stays readable and stable. */
function snapshot(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function writeAudit(tx: Prisma.TransactionClient, entry: AuditEntry) {
  await tx.managementAuditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeData: snapshot(entry.before),
      afterData: snapshot(entry.after),
      source: entry.source
    }
  });
}
