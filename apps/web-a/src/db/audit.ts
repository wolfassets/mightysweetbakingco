import { db } from './index';
import { auditLog } from './schema';

type AuditAction = 'create' | 'update' | 'delete' | 'restore';

export type EntityType =
  | 'flavor'
  | 'flavor_price'
  | 'event'
  | 'event_item'
  | 'delivery'
  | 'delivery_item';

export interface AuditEntry {
  action: AuditAction;
  entityType: EntityType;
  entityId: number;
  entityLabel?: string | null;
  changedFields?: string[] | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityLabel: entry.entityLabel ?? null,
      changedFields: entry.changedFields && entry.changedFields.length > 0 ? JSON.stringify(entry.changedFields) : null,
      beforeJson: entry.before ? JSON.stringify(entry.before) : null,
      afterJson: entry.after ? JSON.stringify(entry.after) : null,
    });
  } catch {
    // Never let audit logging break the main flow
  }
}

export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  ignore: string[] = ['id', 'createdAt', 'updatedAt']
): string[] {
  if (!before || !after) return [];
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const f of fields) {
    if (ignore.includes(f)) continue;
    if (before[f] !== after[f]) changed.push(f);
  }
  return changed;
}
