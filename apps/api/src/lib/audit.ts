/**
 * Audit log helpers.
 *
 * Always call `insertAudit` inside the same Drizzle transaction as the mutation
 * so the audit entry is atomic with the data change.
 *
 * Schema aligned with the Next.js (mightysweetcookies) app — shared Turso DB.
 */

import type { DB } from "../db/index.js";
import { auditLog } from "../db/schema.js";
import { getRequestContext } from "./request-context.js";

export type AuditAction = "create" | "update" | "delete" | "restore";

export interface AuditParams {
  /**
   * Local userId (kept in the type for back-compat with existing callers).
   * Not persisted — the Next.js schema has no user_id column.
   */
  userId?: string;
  /** Entity type, e.g. "flavor", "event", "delivery". Stored in `entity_type`. */
  entity: string;
  entityId: number;
  action: AuditAction;
  entityLabel?: string | null;
  changedFields?: string[] | null;
  before?: unknown;
  after?: unknown;
}

/** Insert a single audit row using the supplied db handle (or transaction). */
export async function insertAudit(tx: DB, params: AuditParams): Promise<void> {
  const ip = getRequestContext().ip;
  await tx.insert(auditLog).values({
    action: params.action,
    entityType: params.entity,
    entityId: params.entityId,
    entityLabel: params.entityLabel ?? null,
    changedFields:
      params.changedFields && params.changedFields.length > 0
        ? JSON.stringify(params.changedFields)
        : null,
    beforeJson: params.before != null ? JSON.stringify(params.before) : null,
    afterJson: params.after != null ? JSON.stringify(params.after) : null,
    ipAddress: ip,
    createdAt: new Date().toISOString(),
  });
}
