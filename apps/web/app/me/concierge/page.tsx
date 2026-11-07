import { subscriptionPlans } from '@cmobeat/config';
import { MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { SubscriptionPanel } from '@/components/billing/SubscriptionPanel';
import { requireArea } from '@/lib/auth';
import { conciergeState } from '@/lib/billing/concierge';
import { summarize } from '@/lib/billing/subscriptions';
import { formatMinor } from '@/lib/searches/terms';
import { CancelCoachingButton, CoachingRequestForm } from './CoachingForms';

export const metadata = { title: 'Concierge' };

const statusText = {
  requested: 'Waiting for a talent partner',
  scheduled: 'Scheduled',
  done: 'Done',
  cancelled: 'Cancelled',
} as const;

export default async function ConciergePage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string }>;
}) {
  const viewer = await requireArea('candidate');
  const sp = await searchParams;
  const { subscription, requests } = await conciergeState(viewer);
  const plan = subscriptionPlans.candidate_concierge;
  const active = subscription?.active ?? false;

  return (
    <DashboardFrame
      eyebrow="Candidate · concierge"
      title={active ? 'A person in your corner.' : 'Want a second opinion from a person?'}
      lede="Concierge adds human coaching from a talent partner: board interviews, offers, and the shape of your next mandate. Your profile stays exactly as private as you set it."
    >
      {sp.subscribed ? (
        <div className="col-span-12">
          <Status tone="human">Concierge is active. Ask for your first session below.</Status>
        </div>
      ) : null}
      <SubscriptionPanel
        className="col-span-12 lg:col-span-5"
        product="candidate_concierge"
        label={plan.label}
        price={formatMinor(plan.amount, plan.currency)}
        summary={plan.summary}
        subscription={summarize(subscription)}
        canManage
      />
      <div className="col-span-12 flex flex-col gap-6 lg:col-span-7">
        {active ? (
          <MeshPanel eyebrow="Coaching" title="Ask for a session">
            <CoachingRequestForm />
          </MeshPanel>
        ) : (
          <MeshPanel eyebrow="Coaching" title="Included with concierge">
            <EmptyState>
              Subscribe to ask a talent partner for coaching. You can cancel any time.
            </EmptyState>
          </MeshPanel>
        )}
        <MeshPanel
          eyebrow="Your requests"
          title={requests.length ? `${requests.length} so far` : 'None yet'}
        >
          {requests.length === 0 ? (
            <EmptyState>Your coaching requests appear here.</EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-line" aria-label="Coaching requests">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-4 py-3">
                  <span className="flex max-w-prose flex-col gap-1">
                    <span className="text-small text-text">{r.topic}</span>
                    <MonoLabel>
                      {statusText[r.status]}
                      {r.scheduledAt
                        ? ` · ${r.scheduledAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`
                        : ''}
                    </MonoLabel>
                  </span>
                  {r.status === 'requested' || r.status === 'scheduled' ? (
                    <CancelCoachingButton id={r.id} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </MeshPanel>
      </div>
    </DashboardFrame>
  );
}
