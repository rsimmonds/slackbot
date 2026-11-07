import { isStaff } from '@cmobeat/config';
import { agentRuns, audit, humanQueue } from '@cmobeat/db';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { Viewer } from '../auth';
import { asViewer } from '../db';
import { EditorialError } from '../editorial/access';

/** App-level check. RLS (agent_runs_staff, human_queue_staff) is the second wall. */
export function requireStaff(viewer: Viewer | null): asserts viewer is Viewer {
  if (!viewer || !isStaff(viewer.roles)) {
    throw new EditorialError('forbidden', 'Agent monitoring is for staff.');
  }
}

export const runStatuses = ['running', 'succeeded', 'failed', 'queued_for_human'] as const;

export const runFiltersSchema = z.object({
  agent: z
    .string()
    .trim()
    .max(60)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  status: z
    .enum(runStatuses)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  days: z.coerce.number().int().min(1).max(90).default(30),
});
export type RunFilters = z.infer<typeof runFiltersSchema>;

const since = (days: number) => new Date(Date.now() - days * 86_400_000);

export async function listRuns(viewer: Viewer | null, filters: RunFilters, limit = 100) {
  requireStaff(viewer);
  return asViewer(viewer, (tx) =>
    tx
      .select({
        id: agentRuns.id,
        agent: agentRuns.agent,
        model: agentRuns.model,
        status: agentRuns.status,
        tokensIn: agentRuns.tokensIn,
        tokensOut: agentRuns.tokensOut,
        costMicros: agentRuns.costMicros,
        latencyMs: agentRuns.latencyMs,
        createdAt: agentRuns.createdAt,
      })
      .from(agentRuns)
      .where(
        and(
          gte(agentRuns.createdAt, since(filters.days)),
          filters.agent ? eq(agentRuns.agent, filters.agent) : undefined,
          filters.status ? eq(agentRuns.status, filters.status) : undefined,
        ),
      )
      .orderBy(desc(agentRuns.createdAt))
      .limit(limit),
  );
}

export interface AgentSummary {
  agent: string;
  runs: number;
  failed: number;
  queued: number;
  /** 0–1, failed + queued_for_human over finished runs. */
  failureRate: number;
  costMicros: number;
  avgLatencyMs: number | null;
}

export async function summaryByAgent(viewer: Viewer | null, days = 30): Promise<AgentSummary[]> {
  requireStaff(viewer);
  const rows = await asViewer(viewer, (tx) =>
    tx
      .select({
        agent: agentRuns.agent,
        runs: sql<number>`count(*)::int`,
        failed: sql<number>`count(*) filter (where ${agentRuns.status} = 'failed')::int`,
        queued: sql<number>`count(*) filter (where ${agentRuns.status} = 'queued_for_human')::int`,
        finished: sql<number>`count(*) filter (where ${agentRuns.status} <> 'running')::int`,
        costMicros: sql<number>`coalesce(sum(${agentRuns.costMicros}), 0)::bigint`,
        avgLatencyMs: sql<number | null>`round(avg(${agentRuns.latencyMs}))::int`,
      })
      .from(agentRuns)
      .where(gte(agentRuns.createdAt, since(days)))
      .groupBy(agentRuns.agent)
      .orderBy(agentRuns.agent),
  );
  return rows.map((r) => ({
    agent: r.agent,
    runs: r.runs,
    failed: r.failed,
    queued: r.queued,
    failureRate: r.finished ? (r.failed + r.queued) / r.finished : 0,
    costMicros: Number(r.costMicros),
    avgLatencyMs: r.avgLatencyMs,
  }));
}

/** Cost per agent per UTC day, oldest first, with zero-cost days filled in. */
export async function costByDay(viewer: Viewer | null, days = 30) {
  requireStaff(viewer);
  const rows = await asViewer(viewer, (tx) =>
    tx
      .select({
        agent: agentRuns.agent,
        day: sql<string>`to_char(date_trunc('day', ${agentRuns.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
        costMicros: sql<number>`coalesce(sum(${agentRuns.costMicros}), 0)::bigint`,
      })
      .from(agentRuns)
      .where(gte(agentRuns.createdAt, since(days)))
      .groupBy(sql`1, 2`),
  );
  const dayList = Array.from({ length: days }, (_, i) =>
    new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
  const byAgent = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!byAgent.has(r.agent)) byAgent.set(r.agent, new Map());
    byAgent.get(r.agent)!.set(r.day, Number(r.costMicros));
  }
  return [...byAgent.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([agent, m]) => ({
      agent,
      days: dayList.map((day) => ({ day, costMicros: m.get(day) ?? 0 })),
    }));
}

export async function openQueue(viewer: Viewer | null) {
  requireStaff(viewer);
  return asViewer(viewer, (tx) =>
    tx
      .select({
        id: humanQueue.id,
        reason: humanQueue.reason,
        createdAt: humanQueue.createdAt,
        agent: agentRuns.agent,
        model: agentRuns.model,
        runId: agentRuns.id,
      })
      .from(humanQueue)
      .innerJoin(agentRuns, eq(agentRuns.id, humanQueue.agentRunId))
      .where(isNull(humanQueue.resolvedAt))
      .orderBy(desc(humanQueue.createdAt))
      .limit(100),
  );
}

/** Marks a human-queue item as handled, in the viewer's own name. Audit-logged. */
export async function resolveQueueItem(viewer: Viewer | null, id: string) {
  requireStaff(viewer);
  return asViewer(viewer, async (tx) => {
    const [row] = await tx
      .update(humanQueue)
      .set({ resolvedBy: viewer.id, resolvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(humanQueue.id, id), isNull(humanQueue.resolvedAt)))
      .returning({ id: humanQueue.id, agentRunId: humanQueue.agentRunId });
    if (!row) throw new EditorialError('not_found', 'Already resolved, or not found.');
    await audit(tx, {
      actorId: viewer.id,
      action: 'human_queue.resolve',
      targetType: 'human_queue',
      targetId: row.id,
      metadata: { agentRunId: row.agentRunId },
    });
    return row;
  });
}

const evalReportSchema = z.object({
  generatedAt: z.string(),
  mode: z.string(),
  results: z.array(
    z.object({
      suite: z.string(),
      total: z.number(),
      model: z.object({
        scored: z.number(),
        passed: z.number(),
        rate: z.number().nullable(),
        threshold: z.number(),
        ok: z.boolean(),
      }),
      fallback: z.object({
        scored: z.number(),
        passed: z.number(),
        rate: z.number().nullable(),
        threshold: z.number(),
        ok: z.boolean(),
      }),
      failures: z.array(
        z.object({ id: z.string(), mode: z.string(), problems: z.array(z.string()) }),
      ),
    }),
  ),
});
export type EvalReport = z.infer<typeof evalReportSchema>;

/**
 * Latest offline eval results, written by `pnpm --filter @cmobeat/web evals:report`.
 * Returns null when the report hasn't been generated in this checkout.
 */
export async function latestEvalReport(
  path = process.env.EVAL_REPORT_PATH ?? join(process.cwd(), '../../agents/eval-report.json'),
): Promise<EvalReport | null> {
  try {
    return evalReportSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch {
    return null;
  }
}

export const formatCost = (micros: number) =>
  `$${(micros / 1_000_000).toFixed(micros >= 10_000_000 ? 2 : 4)}`;
