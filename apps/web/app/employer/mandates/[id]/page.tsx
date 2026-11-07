import { currencies, markets } from '@cmobeat/config';
import {
  Button,
  Field,
  HumanSeal,
  Input,
  MeshPanel,
  MonoLabel,
  Status,
  Textarea,
} from '@cmobeat/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { DashboardFrame } from '@/components/Dashboard';
import { Select } from '@/components/form/Select';
import { requireArea } from '@/lib/auth';
import type { CompBenchmark } from '@/lib/mandates/benchmark';
import { confirmProblems, getMandate } from '@/lib/mandates/document';
import {
  compRange,
  fieldLabel,
  levelLabel,
  marketLabel,
  money,
  workTypeLabel,
} from '@/lib/mandates/labels';
import { confirmMandateAction, saveMandateAction } from '../actions';

export const metadata = { title: 'Mandate' };

function Suggested({ show }: { show: boolean }) {
  return show ? <Status tone="machine">Suggested · edit</Status> : null;
}

function Section({
  eyebrow,
  title,
  aside,
  children,
}: {
  eyebrow: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <MeshPanel className="col-span-12" eyebrow={eyebrow} title={title} actions={aside}>
      <div className="flex flex-col gap-6">{children}</div>
    </MeshPanel>
  );
}

function Benchmark({
  b,
  ownMin,
  ownMax,
}: {
  b: CompBenchmark | null;
  ownMin: number | null;
  ownMax: number | null;
}) {
  if (!b) return null;
  const per = b.basis === 'monthly_retainer' ? ' / mo' : '';
  return (
    <div className="flex flex-col gap-3 rounded-panel border border-line p-5">
      <span className="label-mono">Benchmark · computed from listings, not AI</span>
      {b.enough ? (
        <>
          <dl className="grid grid-cols-3 gap-4">
            {(['p25', 'median', 'p75'] as const).map((k) => (
              <div key={k} className="flex flex-col gap-1">
                <dt className="label-mono">
                  {k === 'median' ? 'Median' : k === 'p25' ? '25th pct' : '75th pct'}
                </dt>
                <dd className="numeric text-h4 text-text">
                  {money(b[k]!, b.currency)}
                  {per}
                </dd>
              </div>
            ))}
          </dl>
          {ownMin !== null && ownMax !== null && b.median !== null ? (
            <p className="text-small text-text-2">
              Your range midpoint is{' '}
              {Math.round((((ownMin + ownMax) / 2 - b.median) / b.median) * 100)}% from the median.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-small text-text-2">
          Not enough data yet: {b.n} comparable listing{b.n === 1 ? '' : 's'}. A benchmark needs at
          least 5, so none is shown rather than a guess.
        </p>
      )}
      <p className="text-micro text-text-3">
        {b.method} {b.n} listings · {levelLabel[b.level as keyof typeof levelLabel] ?? b.level} ·{' '}
        {marketLabel[b.market]} · {b.currency} · as of {b.asOf}.
        {b.sample ? ' Includes sample data.' : ''}
      </p>
    </div>
  );
}

export default async function MandatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; confirmed?: string; error?: string }>;
}) {
  const viewer = await requireArea('employer');
  const { id } = await params;
  const flash = await searchParams;
  const m = await getMandate(viewer, id);
  if (!m) notFound();
  const { doc, narrative } = m;
  const derived = new Set(narrative.derived);
  const problems = confirmProblems(doc);
  const save = saveMandateAction.bind(null, m.id);
  const confirm = confirmMandateAction.bind(null, m.id);
  const comp = compRange(doc.compMin, doc.compMax, doc.currency, doc.compBasis);
  const scoreRows = [
    ...doc.scorecard,
    ...Array.from({ length: Math.max(1, 5 - doc.scorecard.length) }, () => null),
  ];
  const planRows = [
    ...doc.interviewPlan,
    ...Array.from({ length: Math.max(1, 5 - doc.interviewPlan.length) }, () => null),
  ];

  return (
    <DashboardFrame
      eyebrow={`Mandate · ${narrative.sessionRef ?? 'from listing'}`}
      title={doc.title}
      lede={`${levelLabel[doc.level]} · ${workTypeLabel[doc.workType]} · reports to ${doc.reportingLine || '—'}${comp ? ` · ${comp}` : ''}`}
      aside={
        <div className="flex flex-col items-end gap-3">
          {m.confirmedAt ? (
            <HumanSeal label="Confirmed by you" reviewer={viewer.name} at={m.confirmedAt} />
          ) : (
            <Status tone="machine">Drafted from your session · not confirmed</Status>
          )}
          <Button asChild variant="secondary" size="sm">
            <a href={`/api/mandates/${m.id}/pdf`} download>
              Export PDF
            </a>
          </Button>
        </div>
      }
    >
      <div className="col-span-12 flex flex-col gap-3" aria-live="polite">
        {flash.saved ? <Status tone="good">Saved. Confirm again when you are ready.</Status> : null}
        {flash.confirmed ? (
          <Status tone="human">Confirmed. This mandate is ready to use.</Status>
        ) : null}
        {flash.error ? (
          <p role="alert" className="text-small text-critical-ink">
            {flash.error}
          </p>
        ) : null}
        {narrative.missing.length ? (
          <p className="text-small text-text-2">
            The session ended before these were covered:{' '}
            {[...new Set(narrative.missing.map((f) => fieldLabel[f] ?? f))].join(', ')}. Add them
            below.
          </p>
        ) : null}
      </div>

      <form action={save} className="col-span-12 grid grid-cols-12 gap-6">
        <Section
          eyebrow="The seat"
          title="Role"
          aside={<Suggested show={derived.has('level') || derived.has('market')} />}
        >
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Title">
              {(fid) => <Input id={fid} name="title" defaultValue={doc.title} required />}
            </Field>
            <Field label="Level">
              {(fid) => (
                <Select id={fid} name="level" defaultValue={doc.level}>
                  {Object.entries(levelLabel).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Work type">
              {(fid) => (
                <Select id={fid} name="workType" defaultValue={doc.workType}>
                  <option value="full_time">Full-time (annual comp)</option>
                  <option value="fractional">Fractional (monthly retainer)</option>
                </Select>
              )}
            </Field>
            <Field label="Reports to">
              {(fid) => <Input id={fid} name="reportingLine" defaultValue={doc.reportingLine} />}
            </Field>
            <Field label="Market">
              {(fid) => (
                <Select id={fid} name="market" defaultValue={doc.market}>
                  {markets.map((v) => (
                    <option key={v} value={v}>
                      {marketLabel[v]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Team inherited (people)">
              {(fid) => (
                <Input
                  id={fid}
                  name="teamSize"
                  inputMode="numeric"
                  defaultValue={doc.teamSize ?? ''}
                />
              )}
            </Field>
          </div>
        </Section>

        <Section
          eyebrow="Why now"
          title="Summary"
          aside={<Suggested show={derived.has('summary')} />}
        >
          <Field label="Why this seat exists now">
            {(fid) => <Textarea id={fid} name="summary" rows={4} defaultValue={doc.summary} />}
          </Field>
          <Field
            label="Priorities for the first twelve months"
            hint="One per line. At least three."
          >
            {(fid) => (
              <Textarea
                id={fid}
                name="priorities"
                rows={5}
                defaultValue={doc.priorities.join('\n')}
              />
            )}
          </Field>
        </Section>

        <Section eyebrow="The hard parts" title="Tensions, non-negotiables and risks">
          <div className="grid gap-6 md:grid-cols-3">
            <Field label="Who they will disagree with" hint="One per line.">
              {(fid) => (
                <Textarea
                  id={fid}
                  name="tensions"
                  rows={5}
                  defaultValue={doc.tensions.join('\n')}
                />
              )}
            </Field>
            <Field label="Non-negotiables" hint="One per line.">
              {(fid) => (
                <Textarea
                  id={fid}
                  name="nonNegotiables"
                  rows={5}
                  defaultValue={doc.nonNegotiables.join('\n')}
                />
              )}
            </Field>
            <Field label="Risks" hint="One per line.">
              {(fid) => (
                <Textarea id={fid} name="risks" rows={5} defaultValue={doc.risks.join('\n')} />
              )}
            </Field>
          </div>
        </Section>

        <Section
          eyebrow="First 90 days"
          title="Scorecard"
          aside={<Suggested show={derived.has('scorecard')} />}
        >
          <div className="flex flex-col gap-4">
            {scoreRows.map((row, i) => (
              <fieldset
                key={i}
                className="grid gap-3 border-t border-line pt-4 md:grid-cols-[1fr_1fr_120px]"
              >
                <legend className="sr-only">Scorecard outcome {i + 1}</legend>
                <Field label={`Outcome ${i + 1}`}>
                  {(fid) => (
                    <Input
                      id={fid}
                      name={`scorecard.${i}.outcome`}
                      defaultValue={row?.outcome ?? ''}
                    />
                  )}
                </Field>
                <Field label="Measured by">
                  {(fid) => (
                    <Input
                      id={fid}
                      name={`scorecard.${i}.measure`}
                      defaultValue={row?.measure ?? ''}
                    />
                  )}
                </Field>
                <Field label="By day">
                  {(fid) => (
                    <Select
                      id={fid}
                      name={`scorecard.${i}.byDay`}
                      defaultValue={String(row?.byDay ?? 90)}
                    >
                      <option value="30">30</option>
                      <option value="60">60</option>
                      <option value="90">90</option>
                    </Select>
                  )}
                </Field>
              </fieldset>
            ))}
          </div>
        </Section>

        <Section
          eyebrow="Process"
          title="Interview plan"
          aside={<Suggested show={derived.has('interviewPlan')} />}
        >
          <div className="flex flex-col gap-4">
            {planRows.map((row, i) => (
              <fieldset
                key={i}
                className="grid gap-3 border-t border-line pt-4 md:grid-cols-[160px_1fr_2fr]"
              >
                <legend className="sr-only">Interview stage {i + 1}</legend>
                <Field label="Stage">
                  {(fid) => (
                    <Input
                      id={fid}
                      name={`interviewPlan.${i}.stage`}
                      defaultValue={row?.stage ?? `Stage ${i + 1}`}
                    />
                  )}
                </Field>
                <Field label="Who">
                  {(fid) => (
                    <Input
                      id={fid}
                      name={`interviewPlan.${i}.interviewer`}
                      defaultValue={row?.interviewer ?? ''}
                    />
                  )}
                </Field>
                <Field label="What it tests" hint="One per line.">
                  {(fid) => (
                    <Textarea
                      id={fid}
                      name={`interviewPlan.${i}.tests`}
                      rows={2}
                      defaultValue={row?.tests.join('\n') ?? ''}
                    />
                  )}
                </Field>
              </fieldset>
            ))}
          </div>
        </Section>

        <Section eyebrow="Compensation" title={comp ?? 'Range not set'}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="grid gap-6 sm:grid-cols-3">
              <Field label="Currency">
                {(fid) => (
                  <Select id={fid} name="currency" defaultValue={doc.currency}>
                    {currencies.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={doc.workType === 'fractional' ? 'Low (per month)' : 'Low (per year)'}>
                {(fid) => (
                  <Input
                    id={fid}
                    name="compMin"
                    inputMode="numeric"
                    defaultValue={doc.compMin ?? ''}
                  />
                )}
              </Field>
              <Field label={doc.workType === 'fractional' ? 'High (per month)' : 'High (per year)'}>
                {(fid) => (
                  <Input
                    id={fid}
                    name="compMax"
                    inputMode="numeric"
                    defaultValue={doc.compMax ?? ''}
                  />
                )}
              </Field>
            </div>
            <Benchmark b={m.benchmark} ownMin={doc.compMin} ownMax={doc.compMax} />
          </div>
        </Section>

        <div className="col-span-12 flex flex-wrap items-center justify-between gap-4">
          <MonoLabel>Saving clears any earlier confirmation.</MonoLabel>
          <Button type="submit" variant="secondary">
            Save changes
          </Button>
        </div>
      </form>

      <MeshPanel
        className="col-span-12 border-filament/40"
        eyebrow="Human decision"
        title={m.confirmedAt ? 'Confirmed' : 'Confirm this mandate'}
      >
        {problems.length ? (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-small text-text-2">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-text-2">
            Confirming says this is the seat you are hiring for. It becomes the basis for your
            listing, any search, and the shortlist.
          </p>
        )}
        <form action={confirm} className="mt-6 flex flex-wrap items-center gap-4">
          <Button type="submit" variant="human" disabled={problems.length > 0 || !!m.confirmedAt}>
            {m.confirmedAt ? 'Confirmed' : 'Confirm mandate'}
          </Button>
          <Link href="/employer/mandates" className="text-small text-text-2 hover:text-text">
            Back to mandates
          </Link>
        </form>
      </MeshPanel>
    </DashboardFrame>
  );
}
