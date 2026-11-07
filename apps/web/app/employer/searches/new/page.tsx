import { searchFeeTerms } from '@cmobeat/config';
import { Button, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DashboardFrame } from '@/components/Dashboard';
import { uuidPattern } from '@/lib/api';
import { requireArea } from '@/lib/auth';
import { getMandate } from '@/lib/mandates/document';
import { openSearchForMandate } from '@/lib/searches/service';
import { planForWorkType, ratePercent } from '@/lib/searches/terms';
import { requestSearchAction } from '../actions';

export const metadata = { title: 'Request a search' };

export default async function NewSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ mandate?: string; error?: string }>;
}) {
  const viewer = await requireArea('employer');
  const sp = await searchParams;
  if (!sp.mandate || !uuidPattern.test(sp.mandate)) notFound();
  const m = await getMandate(viewer, sp.mandate);
  if (!m) notFound();
  const open = await openSearchForMandate(viewer, m.id);
  if (open) redirect(`/employer/searches/${open.id}`);

  const plan = planForWorkType(m.doc.workType);
  const terms = searchFeeTerms[plan];
  const basis = plan === 'ai_search' ? 'first-year cash compensation' : 'monthly retainer';

  return (
    <DashboardFrame
      eyebrow={`Mandate · ${m.doc.title}`}
      title="Request a search"
      lede="A talent partner runs the search. AI proposes leaders who fit the mandate, a person reviews every match, and candidates decide when to reveal who they are."
    >
      {sp.error ? (
        <p role="alert" className="col-span-12 text-small text-critical-ink">
          {sp.error}
        </p>
      ) : null}
      {!m.confirmedAt ? (
        <MeshPanel className="col-span-12" eyebrow="First" title="Confirm the mandate">
          <p className="text-small text-text-2">
            A search starts from a confirmed mandate, so everyone works from the same definition of
            the role.
          </p>
          <div className="mt-6">
            <Button asChild variant="secondary">
              <Link href={`/employer/mandates/${m.id}`}>Open the mandate</Link>
            </Button>
          </div>
        </MeshPanel>
      ) : (
        <MeshPanel className="col-span-12 lg:col-span-8" eyebrow="Fee terms" title={terms.label}>
          <form action={requestSearchAction} className="flex flex-col gap-6">
            <input type="hidden" name="mandateId" value={m.id} />
            <input type="hidden" name="plan" value={plan} />
            <dl className="grid gap-6 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <dt className="label-mono">Rate</dt>
                <dd className="numeric text-h3 text-text">{ratePercent(terms.rateBps)}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="label-mono">Of</dt>
                <dd className="text-small text-text">{basis}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="label-mono">Currency</dt>
                <dd className="numeric text-small text-text">{m.doc.currency}</dd>
              </div>
            </dl>
            <p className="text-body text-text-2">{terms.summary}</p>
            <ul className="flex flex-col gap-2 text-small text-text-2">
              <li>Invoices are due within 30 days, in {m.doc.currency}.</li>
              <li>
                You see anonymized shortlists. Identities are shared only when a candidate consents.
              </li>
              <li>
                These terms are saved with the search. Later changes to our prices never apply to
                it.
              </li>
            </ul>
            <label className="flex items-start gap-3 rounded-panel border border-filament/40 p-4">
              <input
                type="checkbox"
                name="acceptTerms"
                required
                className="mt-1 size-4 accent-[var(--filament-ink)]"
              />
              <span className="text-small text-text">
                I accept these fee terms on behalf of {m.companyName}.
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="human">
                Request search
              </Button>
              <Button asChild variant="ghost">
                <Link href={`/employer/mandates/${m.id}`}>Back to the mandate</Link>
              </Button>
            </div>
          </form>
        </MeshPanel>
      )}
      <aside className="col-span-12 flex flex-col gap-3 lg:col-span-4">
        <MonoLabel>What happens next</MonoLabel>
        <Status tone="machine">AI proposes matches</Status>
        <Status tone="human">A talent partner approves each one</Status>
        <Status tone="human">Candidates choose to reveal themselves</Status>
      </aside>
    </DashboardFrame>
  );
}
