import 'server-only';
import type { FairnessMetrics } from '@cmobeat/ai/matching';
import { fairnessReports } from '@cmobeat/db';
import { desc } from 'drizzle-orm';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';

export interface FairnessReportRow {
  id: string;
  agent: string;
  periodStart: Date;
  periodEnd: Date;
  passed: boolean;
  createdAt: Date;
  metrics: FairnessMetrics & { dataSource?: string };
}

/** Staff only (RLS: fairness_reports is visible to staff and nobody else). */
export async function listFairnessReports(
  viewer: Viewer,
  limit = 12,
): Promise<FairnessReportRow[]> {
  const rows = await asViewer(viewer, (tx) =>
    tx.select().from(fairnessReports).orderBy(desc(fairnessReports.createdAt)).limit(limit),
  );
  return rows.map((r) => ({
    ...r,
    metrics: r.metrics as unknown as FairnessReportRow['metrics'],
  }));
}
