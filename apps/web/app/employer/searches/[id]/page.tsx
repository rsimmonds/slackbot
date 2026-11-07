import { Button, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import {
  invoiceText,
  invoiceTone,
  isoDate,
  SearchStages,
  SearchTimeline,
} from '@/components/searches/SearchParts';
import { uuidPattern } from '@/lib/api';
import { requireArea } from '@/lib/auth';
import { getEmployerSearch, SearchError } from '@/lib/searches/service';
import {
  feeTermsSnapshot,
  formatMinor,
  formatWhole,
  planLabel,
  ratePercent,
} from '@/lib/searches/terms';

export const metadata = { title: 'Search' };

export default async function EmployerSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ requested?: string }>;
}) {
  const viewer = await requireArea('employer');
  const { id } = await params;
  const sp = await searchParams;
  if (!uuidPattern.test(id)) notFound();
  let data;
  try {
    data = await getEmployerSearch(viewer, id);
  } catch (e) {
    if (e instanceof SearchError && e.status === 404) notFound();
    throw e;
  }
  const { search: s, invoices, timeline } = data;
  const terms = feeTermsSnapshot.safeParse(s.feeTerms);

  return (
    <DashboardFrame
      eyebrow={`${planLabel[s.plan]} · requested ${isoDate(s.createdAt)}`}
      title={s.title}
      lede={
        s.talentPartnerId
          ? 'A talent partner is running this search. You will be notified at each stage.'
          : 'Waiting for a talent partner to take this search, usually within one business day.'
      }
      aside={
        <Button asChild variant="secondary" size="sm">
          <Link href={`/employer/mandates/${s.mandateId}/shortlist`}>Anonymized shortlist</Link>
        </Button>
      }
    >
      {sp.requested ? (
        <div className="col-span-12">
          <Status tone="human">Search requested. Your accepted terms are saved with it.</Status>
        </div>
      ) : null}
      <MeshPanel className="col-span-12" eyebrow="Stage" title="Where the search is">
        <SearchStages status={s.status} />
      </MeshPanel>
      <MeshPanel className="col-span-12 lg:col-span-7" eyebrow="History" title="Timeline">
        <SearchTimeline entries={timeline} />
      </MeshPanel>
      <MeshPanel className="col-span-12 lg:col-span-5" eyebrow="Terms you accepted" title="Fees">
        {terms.success ? (
          <dl className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <dt className="label-mono">Rate</dt>
              <dd className="numeric text-h4 text-text">{ratePercent(terms.data.rateBps)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="label-mono">Of</dt>
              <dd className="text-small text-text">
                {terms.data.basis === 'monthly_retainer'
                  ? 'Monthly retainer'
                  : 'First-year cash comp'}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="label-mono">Accepted</dt>
              <dd className="numeric text-small text-text">{terms.data.acceptedAt.slice(0, 10)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="label-mono">Terms version</dt>
              <dd className="numeric text-small text-text">{terms.data.version}</dd>
            </div>
          </dl>
        ) : (
          <EmptyState>Terms not recorded.</EmptyState>
        )}
        {s.placementComp != null && s.placementCurrency ? (
          <p className="mt-6 text-small text-text-2">
            Placed {isoDate(s.hiredAt)} at {formatWhole(s.placementComp, s.placementCurrency)}
            {s.plan === 'fractional_match' ? ' a month' : ' first-year cash'}.
          </p>
        ) : null}
      </MeshPanel>
      <MeshPanel className="col-span-12" eyebrow="Billing" title="Invoices for this search">
        {invoices.length === 0 ? (
          <EmptyState>Nothing to pay. Fees are invoiced only when someone is hired.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {invoices.map((inv) => (
              <li key={inv.ref} className="flex flex-wrap items-center justify-between gap-4 py-3">
                <span className="flex flex-col gap-1">
                  <span className="numeric text-small text-text">
                    {formatMinor(inv.amount, inv.currency)}
                  </span>
                  <MonoLabel>Issued {isoDate(inv.createdAt)}</MonoLabel>
                </span>
                <span className="flex items-center gap-4">
                  <Status tone={invoiceTone(inv.status)}>{invoiceText(inv.status)}</Status>
                  <Link
                    href={`/billing/invoices/${inv.ref}`}
                    className="text-small text-text-2 underline underline-offset-4 hover:text-text"
                  >
                    View invoice
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </MeshPanel>
    </DashboardFrame>
  );
}
