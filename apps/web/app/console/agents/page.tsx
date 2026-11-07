import { Button, DataCard, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { Select } from '@/components/form/Select';
import { requireArea } from '@/lib/auth';
import {
  costByDay,
  formatCost,
  latestEvalReport,
  listRuns,
  openQueue,
  runFiltersSchema,
  runStatuses,
  summaryByAgent,
} from '@/lib/agents/monitoring';
import { resolveQueueAction } from './actions';

export const metadata = { title: 'Agents' };

const statusTone = {
  running: 'machine',
  succeeded: 'good',
  failed: 'critical',
  queued_for_human: 'human',
} as const;
const statusLabel = {
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  queued_for_human: 'Sent to a person',
} as const;

const pct = (r: number | null) => (r === null ? 'n/a' : `${Math.round(r * 100)}%`);
const stamp = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const viewer = await requireArea('staff');
  const sp = await searchParams;
  const parsed = runFiltersSchema.safeParse(sp);
  const filters = parsed.success ? parsed.data : runFiltersSchema.parse({});
  const [summary, daily, runs, queue, evals] = await Promise.all([
    summaryByAgent(viewer, filters.days),
    costByDay(viewer, 30),
    listRuns(viewer, filters),
    openQueue(viewer),
    latestEvalReport(),
  ]);
  const totalCost = summary.reduce((s, a) => s + a.costMicros, 0);
  const totalRuns = summary.reduce((s, a) => s + a.runs, 0);
  const totalFailed = summary.reduce((s, a) => s + a.failed + a.queued, 0);
  const maxDay = Math.max(1, ...daily.flatMap((a) => a.days.map((d) => d.costMicros)));
  const agents = [...new Set(summary.map((s) => s.agent))];

  return (
    <DashboardFrame
      eyebrow="Staff console · agents"
      title="Every AI call, logged."
      lede="Cost, failures and the work agents handed to a person. Nothing here is visible outside the console."
    >
      {sp.resolved ? (
        <div role="status" className="col-span-12">
          <Status tone="human">
            {sp.resolved === 'already'
              ? 'That item was already resolved.'
              : 'Resolved in your name.'}
          </Status>
        </div>
      ) : null}

      <div className="col-span-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <DataCard value={String(totalRuns)} label={`Runs, last ${filters.days} days`} />
        <DataCard value={formatCost(totalCost)} label={`Cost, last ${filters.days} days`} />
        <DataCard
          value={totalRuns ? pct(totalFailed / totalRuns) : '—'}
          label="Failed or sent to a person"
        />
        <DataCard value={String(queue.length)} label="Waiting for a person" />
      </div>

      <MeshPanel className="col-span-12" eyebrow="By agent" title="Last 30 days">
        {summary.length === 0 ? (
          <EmptyState>
            No agent runs yet. They appear here as soon as an agent is called.
          </EmptyState>
        ) : (
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Agents, last 30 days"
          >
            <table className="w-full min-w-[640px] border-collapse text-left text-small">
              <thead>
                <tr className="border-b border-line">
                  {['Agent', 'Runs', 'Failure rate', 'Cost', 'Avg latency', 'Daily cost'].map(
                    (h) => (
                      <th key={h} scope="col" className="label-mono py-2 pr-4 font-normal">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {summary.map((a) => {
                  const series = daily.find((d) => d.agent === a.agent)?.days ?? [];
                  return (
                    <tr key={a.agent} className="border-b border-line">
                      <th scope="row" className="numeric py-3 pr-4 font-normal text-text">
                        {a.agent}
                      </th>
                      <td className="numeric py-3 pr-4">{a.runs}</td>
                      <td className="numeric py-3 pr-4">
                        <span className={a.failureRate > 0.1 ? 'text-critical-ink' : undefined}>
                          {pct(a.failureRate)}
                        </span>
                      </td>
                      <td className="numeric py-3 pr-4">{formatCost(a.costMicros)}</td>
                      <td className="numeric py-3 pr-4">
                        {a.avgLatencyMs === null ? '—' : `${a.avgLatencyMs} ms`}
                      </td>
                      <td className="py-3">
                        <div
                          className="flex h-6 items-end gap-px"
                          role="img"
                          aria-label={`Daily cost for ${a.agent}, last 30 days, peak ${formatCost(Math.max(0, ...series.map((d) => d.costMicros)))}`}
                        >
                          {series.map((d) => (
                            <span
                              key={d.day}
                              title={`${d.day}: ${formatCost(d.costMicros)}`}
                              className="w-1 bg-text-3"
                              style={{ height: `${Math.max(1, (d.costMicros / maxDay) * 24)}px` }}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </MeshPanel>

      <MeshPanel
        className="col-span-12 lg:col-span-6"
        eyebrow="Human queue"
        title={queue.length ? `${queue.length} waiting` : 'Clear'}
        actions={<Status tone="human">People decide</Status>}
      >
        {queue.length === 0 ? (
          <EmptyState>
            When an agent&apos;s output fails validation twice, the work lands here for a person.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line border-t border-line">
            {queue.map((q) => (
              <li key={q.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-small text-text">{q.reason}</span>
                  <MonoLabel>
                    {q.agent} · {q.model} · {stamp(q.createdAt)}
                  </MonoLabel>
                </div>
                <form action={resolveQueueAction.bind(null, q.id)}>
                  <Button
                    type="submit"
                    variant="human"
                    size="sm"
                    aria-label={`Mark resolved: ${q.reason}`}
                  >
                    Mark resolved
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </MeshPanel>

      <MeshPanel
        className="col-span-12 lg:col-span-6"
        eyebrow="Evals"
        title="Latest offline results"
        actions={evals ? <MonoLabel>{stamp(new Date(evals.generatedAt))}</MonoLabel> : null}
      >
        {!evals ? (
          <EmptyState>
            No report yet. Run{' '}
            <code className="numeric">pnpm --filter @cmobeat/web evals:report</code>.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line border-t border-line">
            {evals.results.map((r) => (
              <li key={r.suite} className="flex flex-col gap-1 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="numeric text-small text-text">{r.suite}</span>
                  <Status tone={r.fallback.ok && r.model.ok ? 'good' : 'critical'}>
                    {r.fallback.ok && r.model.ok ? 'Passing' : 'Below threshold'}
                  </Status>
                </div>
                <MonoLabel>
                  {r.total} cases · offline {r.fallback.passed}/{r.fallback.scored} (
                  {pct(r.fallback.rate)}) · model{' '}
                  {r.model.scored
                    ? `${r.model.passed}/${r.model.scored} (${pct(r.model.rate)})`
                    : 'not yet recorded'}
                </MonoLabel>
              </li>
            ))}
          </ul>
        )}
      </MeshPanel>

      <MeshPanel className="col-span-12" eyebrow="Runs" title="Recent calls">
        <form className="mb-6 grid gap-4 sm:grid-cols-4" method="get">
          <label className="flex flex-col gap-2">
            <span className="label-mono">Agent</span>
            <Select name="agent" defaultValue={filters.agent ?? ''}>
              <option value="">All agents</option>
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="label-mono">Status</span>
            <Select name="status" defaultValue={filters.status ?? ''}>
              <option value="">Any status</option>
              {runStatuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="label-mono">Window</span>
            <Select name="days" defaultValue={String(filters.days)}>
              {[1, 7, 30, 90].map((d) => (
                <option key={d} value={d}>
                  Last {d} {d === 1 ? 'day' : 'days'}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex items-end">
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </div>
        </form>
        {runs.length === 0 ? (
          <EmptyState>No runs match.</EmptyState>
        ) : (
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Recent agent runs"
          >
            <table className="w-full min-w-[720px] border-collapse text-left text-small">
              <thead>
                <tr className="border-b border-line">
                  {['Time', 'Agent', 'Model', 'Status', 'Tokens in / out', 'Cost', 'Latency'].map(
                    (h) => (
                      <th key={h} scope="col" className="label-mono py-2 pr-4 font-normal">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-line">
                    <td className="numeric py-2 pr-4 text-text-2">{stamp(r.createdAt)}</td>
                    <td className="numeric py-2 pr-4 text-text">{r.agent}</td>
                    <td className="numeric py-2 pr-4 text-text-2">{r.model}</td>
                    <td className="py-2 pr-4">
                      <Status tone={statusTone[r.status]}>{statusLabel[r.status]}</Status>
                    </td>
                    <td className="numeric py-2 pr-4">
                      {r.tokensIn.toLocaleString('en-US')} / {r.tokensOut.toLocaleString('en-US')}
                    </td>
                    <td className="numeric py-2 pr-4">{formatCost(r.costMicros)}</td>
                    <td className="numeric py-2">
                      {r.latencyMs === null ? '—' : `${r.latencyMs} ms`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </MeshPanel>
    </DashboardFrame>
  );
}
