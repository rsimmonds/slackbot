import { auditLog } from './schema';
import type { Db, Tx } from './client';

export interface AuditEntry {
  /** Null for system actions (jobs, webhooks). Under withUser it must equal the current user. */
  actorId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Append one row to audit_log. Call inside the same transaction as the action it records. */
export async function audit(tx: Tx | Db, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
  });
}
