import { Button, DataCard, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { listFairnessReports } from '@/lib/matching/reports';
import { runFairnessReportAction } from './actions';

export const metadata = { title: 'Fairness' };

const pct = (r: number) => `${Math.round(r * 100)}%`;
const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function FairnessPage({
  searchParams,
}: {
  searchParams: Promise<{ ran?: string }>;
}) {
  const viewer = await requireArea('staff');
  const { ran } = await searchParams;
  const reports = await listFairnessReports(viewer);
  const latest = reports[0];
  const m = latest?.metrics;

  return (
    <DashboardFrame
      eyebrow="Staff console · fairness"
      title="The Matcher, tested for bias every week."
      lede="Synthetic candidates who differ only in protected attributes must look identical to the Matcher and be put forward at the same rate. A person still approves every match."
      aside={
        <form action={runFairnessReportAction}>
          <Button type="submit" variant="machine">
            Run the report now
          </Button>
        </form>
      }
    >
      {ran ? (
        <p role="status" className="col-span-12 text-small text-text-2">
          Report recorded.
        </p>
      ) : null}

      {!latest || !m ? (
        <MeshPanel className="col-span-12" eyebrow="Reports" title="No report yet">
          <EmptyState>The first report runs on Monday at 06:00 UTC, or run it now.</EmptyState>
        </MeshPanel>
      ) : (
        <>
          <div className="col-span-12 grid gap-6 md:grid-cols-4">
            <MeshPanel
              eyebrow="Latest report"
              title={latest.passed ? 'Passed' : 'Needs attention'}
              actions={
                <Status tone={latest.passed ? 'good' : 'critical'}>
                  {latest.passed ? 'Within four-fifths' : 'Below four-fifths'}
                </Status>
              }
            >
              <MonoLabel>
                {day(latest.periodStart)} to {day(latest.periodEnd)}
              </MonoLabel>
            </MeshPanel>
            <DataCard
              value={m.minimumImpactRatio.toFixed(2)}
              label="Lowest impact ratio"
              footnote="0.80 or above passes"
            />
            <DataCard
              value={`${m.invariance.identicalInputs}/${m.invariance.pairsChecked}`}
              label="Identical blind inputs"
              footnote="Variant pairs that looked the same to the Matcher"
            />
            <DataCard
              value={String(m.sample.scoredVariants)}
              label="Variants scored"
              footnote={m.matcher}
            />
          </div>

          <MeshPanel
            className="col-span-12"
            eyebrow="Selection rates"
            title="Put forward, by group"
          >
            <div
              tabIndex={0}
              role="region"
              aria-label="Selection rates by group"
              className="overflow-x-auto"
            >
              <table className="w-full min-w-[560px] border-collapse text-left text-small">
                <thead>
                  <tr className="border-b border-line">
                    {['Attribute', 'Group', 'Scored', 'Put forward', 'Rate', 'Impact ratio'].map(
                      (h) => (
                        <th key={h} scope="col" className="label-mono py-2 pr-4 font-normal">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {m.selection.flatMap((s) =>
                    s.groups.map((g, i) => (
                      <tr key={`${s.attribute}-${g.group}`} className="border-b border-line">
                        {i === 0 ? (
                          <th
                            scope="rowgroup"
                            rowSpan={s.groups.length}
                            className="py-3 pr-4 align-top font-normal text-text"
                          >
                            {s.attribute}
                          </th>
                        ) : null}
                        <td className="py-3 pr-4 text-text-2">{g.group}</td>
                        <td className="numeric py-3 pr-4">{g.n}</td>
                        <td className="numeric py-3 pr-4">{g.selected}</td>
                        <td className="numeric py-3 pr-4">{pct(g.rate)}</td>
                        {i === 0 ? (
                          <td rowSpan={s.groups.length} className="numeric py-3 align-top">
                            <span className={s.passes ? 'text-good-ink' : 'text-critical-ink'}>
                              {s.impactRatio.toFixed(2)}
                            </span>
                          </td>
                        ) : null}
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
            {m.invariance.failures.length ? (
              <div className="mt-6">
                <MonoLabel className="text-critical-ink">Invariance failures</MonoLabel>
                <ul className="mt-2 text-small text-text-2">
                  {m.invariance.failures.slice(0, 10).map((f) => (
                    <li key={`${f.attribute}-${f.base}-${f.problem}`}>
                      {f.attribute}, base {f.base}: {f.problem}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </MeshPanel>

          <MeshPanel
            className="col-span-12 lg:col-span-7"
            eyebrow="Method"
            title="How this is measured"
          >
            <div className="flex flex-col gap-3 text-small text-text-2">
              <p>{m.method}</p>
              <p>
                <strong className="font-medium text-text">Synthetic data only.</strong> CMO Beat
                does not collect gender, ethnicity, age or any other protected attribute, so there
                is no real-world demographic data to audit. The report uses synthetic test
                candidates instead. Whether this satisfies NYC Local Law 144 and the EU AI Act is
                under legal review.
              </p>
              <p>
                Before matching, names, employers, contact details, years and protected-attribute
                statements are removed from every profile. Years of experience are never sent to the
                Matcher.
              </p>
            </div>
          </MeshPanel>

          <MeshPanel className="col-span-12 lg:col-span-5" eyebrow="History" title="Recent reports">
            <ul className="flex flex-col divide-y divide-line">
              {reports.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                  <MonoLabel>{day(r.createdAt)}</MonoLabel>
                  <span className="numeric text-small text-text-2">
                    min {r.metrics.minimumImpactRatio.toFixed(2)}
                  </span>
                  <Status tone={r.passed ? 'good' : 'critical'}>
                    {r.passed ? 'Passed' : 'Failed'}
                  </Status>
                </li>
              ))}
            </ul>
          </MeshPanel>
        </>
      )}
    </DashboardFrame>
  );
}
