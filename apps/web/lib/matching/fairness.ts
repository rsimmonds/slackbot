import 'server-only';
import { AnthropicProvider, providerName } from '@cmobeat/ai';
import { providerMatcher, runFairnessSuite, type FairnessMetrics } from '@cmobeat/ai/matching';
import { adminDb, audit, fairnessReports } from '@cmobeat/db';

/**
 * Weekly fairness report for the Matcher (spec 7.1.9). Runs the synthetic paired-profile suite
 * and stores the result. CMO Beat does not collect protected attributes, so there is no
 * real-world demographic data; the audit uses synthetic test data (see LEGAL_REVIEW).
 *
 * By default the deterministic offline matcher is measured. With FAIRNESS_LIVE=1 and a Claude
 * key, the live Matcher is measured instead (about 2,100 scored variants: a real cost).
 */
export async function runFairnessReport(
  opts: { now?: Date; actorId?: string | null } = {},
): Promise<{ id: string; passed: boolean; metrics: FairnessMetrics }> {
  const now = opts.now ?? new Date();
  const live = process.env.FAIRNESS_LIVE === '1' && providerName() === 'anthropic';
  const metrics = await runFairnessSuite(
    live
      ? { matcher: providerMatcher(new AnthropicProvider()), matcherName: 'Claude (live Matcher)' }
      : {},
  );
  const db = adminDb();
  const [row] = await db
    .insert(fairnessReports)
    .values({
      agent: 'matcher',
      periodStart: new Date(now.getTime() - 7 * 24 * 3600_000),
      periodEnd: now,
      passed: metrics.passed,
      metrics: { ...metrics, dataSource: 'synthetic' },
    })
    .returning({ id: fairnessReports.id });
  await audit(db, {
    actorId: opts.actorId ?? null,
    action: 'fairness.report',
    targetType: 'fairness_report',
    targetId: row!.id,
    metadata: { passed: metrics.passed, minimumImpactRatio: metrics.minimumImpactRatio },
  });
  return { id: row!.id, passed: metrics.passed, metrics };
}
