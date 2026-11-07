import { catalogue } from '@cmobeat/config';
import { MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import { notFound } from 'next/navigation';
import { DashboardFrame } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { uuidPattern } from '@/lib/api';
import { editableStatuses, getEmployerListing, mandateGaps } from '@/lib/jobs/posting';
import { hasActiveEmployerSubscription } from '@/lib/billing/status';
import { MandateForm } from './MandateForm';
import { PlanForm } from './PlanForm';

export const metadata = { title: 'Edit listing' };

const usd = (minor: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(minor / 100);

export default async function EditListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ parsed?: string; confirmed?: string; checkout?: string }>;
}) {
  const viewer = await requireArea('employer');
  const { id } = await params;
  const sp = await searchParams;
  if (!uuidPattern.test(id)) notFound();
  const row = await asViewer(viewer, (tx) => getEmployerListing(tx, id));
  if (!row) notFound();
  const { listing, mandate } = row;
  const editable = (editableStatuses as readonly string[]).includes(listing.status);
  const gaps = mandateGaps(mandate);
  const confirmed = !!mandate.confirmedAt;
  const subscribed = await hasActiveEmployerSubscription(listing.companyId!);

  return (
    <DashboardFrame
      eyebrow={confirmed ? 'Post a job · Step 3 of 3' : 'Post a job · Step 2 of 3'}
      title={
        confirmed ? 'Mandate confirmed. Choose a plan.' : 'Check the mandate, then confirm it.'
      }
      lede={
        sp.parsed
          ? 'I drafted this from your description. Every field is yours to change. Nothing is published until you confirm, pay, and a person reviews it.'
          : undefined
      }
    >
      <div className="col-span-12 flex flex-col gap-6 lg:col-span-8">
        {listing.status === 'rejected' && listing.moderationNote ? (
          <MeshPanel eyebrow="Changes requested by our editors" className="border-filament/50">
            <p className="text-body text-text">{listing.moderationNote}</p>
            <p className="mt-3 text-small text-text-2">
              Edit, confirm, and resubmit. {listing.paidAt ? 'You will not be charged again.' : ''}
            </p>
          </MeshPanel>
        ) : null}
        {sp.checkout === 'cancelled' ? (
          <Status tone="critical">Checkout cancelled. Nothing was charged.</Status>
        ) : null}
        <MeshPanel eyebrow="Mandate" title={mandate.title}>
          <MandateForm
            listingId={listing.id}
            editable={editable}
            values={{
              title: mandate.title,
              level: mandate.level,
              scope: mandate.scope,
              reportingLine: mandate.reportingLine,
              teamSize: mandate.teamSize,
              priorities: mandate.priorities,
              compMin: mandate.compMin,
              compMax: mandate.compMax,
              currency: mandate.currency,
              compBasis: mandate.compBasis,
              workType: mandate.workType,
              location: mandate.location,
              remote: mandate.remote,
              market: mandate.market,
            }}
          />
        </MeshPanel>
        {confirmed && editable ? (
          <section id="plan" aria-labelledby="plan-title">
            <MeshPanel
              eyebrow="Plan"
              title={
                <span id="plan-title">{listing.paidAt ? 'Already paid' : 'Choose a plan'}</span>
              }
            >
              <PlanForm
                listingId={listing.id}
                current={listing.plan}
                alreadyPaid={!!listing.paidAt}
                options={[
                  ...(subscribed
                    ? [
                        {
                          value: 'subscription' as const,
                          label: 'Included in your subscription',
                          price: usd(0),
                          detail:
                            'Unlimited posts while your subscription is active. Reviewed by a person, then live for 60 days.',
                        },
                      ]
                    : []),
                  {
                    value: 'standard',
                    label: catalogue.job_post_standard.label,
                    price: usd(catalogue.job_post_standard.amount),
                    detail: '60 days on the board and in matching alerts.',
                  },
                  {
                    value: 'featured',
                    label: catalogue.job_post_featured.label,
                    price: usd(catalogue.job_post_featured.amount),
                    detail:
                      '60 days, pinned to the top of the board and featured on the home page.',
                  },
                ]}
              />
            </MeshPanel>
          </section>
        ) : null}
      </div>
      <aside className="col-span-12 flex flex-col gap-4 lg:col-span-4">
        <MeshPanel eyebrow="Status">
          <div className="flex flex-col gap-3">
            <Status tone={confirmed ? 'human' : 'machine'}>
              {confirmed ? 'Confirmed by you' : 'Drafted from your description'}
            </Status>
            <MonoLabel>Listing · {listing.status.replace('_', ' ')}</MonoLabel>
          </div>
        </MeshPanel>
        {gaps.length && editable ? (
          <MeshPanel eyebrow="Before you confirm" className="border-filament/40">
            <ul className="flex flex-col gap-3">
              {gaps.map((g) => (
                <li key={g} className="flex gap-3 text-small text-text">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-filament" />
                  {g}
                </li>
              ))}
            </ul>
          </MeshPanel>
        ) : null}
      </aside>
    </DashboardFrame>
  );
}
