import type { Role } from '@cmobeat/config';
import { adminDb, auditLog, companies, moves } from '@cmobeat/db';
import { devUsers } from '@cmobeat/db/dev-users';
import { and, desc, eq } from 'drizzle-orm';
import type { Viewer } from '@/lib/auth';

const byEmail = (prefix: string): Viewer => {
  const u = devUsers.find((d) => d.email.startsWith(prefix))!;
  return { id: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[] };
};

export const viewers = {
  reader: byEmail('reader@'),
  candidate: byEmail('candidate@'),
  employer: byEmail('employer@'),
  editor: byEmail('editor@'),
  talent: byEmail('talent@'),
  admin: byEmail('admin@'),
};

let n = 0;
/** A fresh AI-style draft move, inserted as the system (like the Moves Tracker does). */
export async function createDraftMove(overrides: Partial<typeof moves.$inferInsert> = {}) {
  const [company] = await adminDb().select({ id: companies.id }).from(companies).limit(1);
  const [row] = await adminDb()
    .insert(moves)
    .values({
      personName: `Test Person ${Date.now()}-${n++}`,
      companyId: company!.id,
      moveType: 'appointed',
      title: 'Chief Marketing Officer',
      effectiveDate: '2026-11-01',
      sources: [
        { url: 'https://newsroom.example/press/cmo', label: 'Company newsroom', kind: 'newsroom' },
      ],
      confidence: 0.82,
      summary: 'Appointed to lead brand and demand.',
      status: 'draft',
      ...overrides,
    })
    .returning();
  return row!;
}

export async function auditFor(targetId: string) {
  return adminDb()
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.targetId, targetId)))
    .orderBy(desc(auditLog.at));
}

export const editInput = (
  m: Awaited<ReturnType<typeof createDraftMove>>,
  patch: Record<string, unknown> = {},
) => ({
  personName: m.personName,
  companyId: m.companyId,
  moveType: m.moveType,
  title: m.title,
  previousRole: m.previousRole,
  effectiveDate: m.effectiveDate,
  summary: m.summary,
  sources: m.sources,
  ...patch,
});
