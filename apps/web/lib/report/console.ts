import 'server-only';
import { audit, reportDownloads, subscribers } from '@cmobeat/db';
import { desc, eq, sql } from 'drizzle-orm';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { isEditorial } from '@/lib/editorial/access';

/**
 * Report leads for editors and admins. Reads run under RLS (report_downloads and subscribers are
 * editorial-only), so nobody else can list leads even if they reach this code.
 */
export class LeadsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function requireLeadsAccess(viewer: Viewer | null): asserts viewer is Viewer {
  if (!viewer) throw new LeadsError(401, 'Sign in to continue.');
  if (!isEditorial(viewer)) throw new LeadsError(403, 'Report leads are for editors and admins.');
}

export interface LeadRow {
  id: string;
  createdAt: Date;
  email: string | null;
  company: string | null;
  role: string | null;
  market: string | null;
  optedIn: boolean;
  /** Newsletter confirmed (double opt-in completed). Null when they did not opt in. */
  confirmed: boolean | null;
}

export async function listLeads(viewer: Viewer | null, limit = 500): Promise<LeadRow[]> {
  requireLeadsAccess(viewer);
  const rows = await asViewer(viewer, (tx) =>
    tx
      .select({
        id: reportDownloads.id,
        createdAt: reportDownloads.createdAt,
        email: reportDownloads.email,
        company: reportDownloads.company,
        role: reportDownloads.role,
        market: reportDownloads.market,
        optedIn: reportDownloads.newsletterOptIn,
        subscriberStatus: subscribers.status,
      })
      .from(reportDownloads)
      .leftJoin(subscribers, eq(subscribers.id, reportDownloads.subscriberId))
      .orderBy(desc(reportDownloads.createdAt))
      .limit(limit),
  );
  return rows.map(({ subscriberStatus, ...r }) => ({
    ...r,
    confirmed: r.optedIn ? subscriberStatus === 'active' : null,
  }));
}

export async function downloadsPerDay(viewer: Viewer | null, days = 30) {
  requireLeadsAccess(viewer);
  const rows = await asViewer(viewer, (tx) =>
    tx.execute<{ day: string; n: number }>(sql`
      select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*)::int as n
      from report_downloads
      where created_at >= now() - (${days}::int * interval '1 day')
      group by 1 order by 1`),
  );
  return [...rows].map((r) => ({ day: r.day, n: Number(r.n) }));
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** CSV of all leads. Every export is written to the audit log in the exporter's name. */
export async function exportLeadsCsv(viewer: Viewer | null): Promise<string> {
  requireLeadsAccess(viewer);
  const leads = await listLeads(viewer, 100_000);
  await asViewer(viewer, (tx) =>
    audit(tx, {
      actorId: viewer.id,
      action: 'report_leads.export',
      targetType: 'report_downloads',
      metadata: { rows: leads.length },
    }),
  );
  const head = [
    'requested_at',
    'email',
    'company',
    'role',
    'market',
    'newsletter_opt_in',
    'newsletter_confirmed',
  ];
  const lines = leads.map((l) =>
    [
      l.createdAt.toISOString(),
      l.email,
      l.company,
      l.role,
      l.market,
      l.optedIn ? 'yes' : 'no',
      l.confirmed === null ? '' : l.confirmed ? 'yes' : 'no',
    ]
      .map(csvCell)
      .join(','),
  );
  return [head.join(','), ...lines].join('\n') + '\n';
}
