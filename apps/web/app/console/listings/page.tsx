import { DataCard, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { compLabel, levelLabel, workTypeLabel } from '@/lib/jobs/format';
import { listingCounts, moderationQueue, recentListings } from '@/lib/jobs/moderation';
import { DecisionForm } from './DecisionForm';

export const metadata = { title: 'Listings moderation' };

const date = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');

export default async function ListingsModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ decided?: string }>;
}) {
  const viewer = await requireArea('staff');
  const sp = await searchParams;
  const { queue, live, expired, counts } = await asViewer(viewer, async (tx) => ({
    queue: await moderationQueue(tx),
    live: await recentListings(tx, 'live', 8),
    expired: await recentListings(tx, 'expired', 5),
    counts: await listingCounts(tx),
  }));

  return (
    <DashboardFrame
      eyebrow="Staff console · Listings"
      title="Nothing goes live until a person reads it."
      lede="Check the mandate is real, comp is stated and the listing is a senior marketing role. Approve to publish for 60 days."
    >
      <div className="col-span-12 grid gap-6 md:grid-cols-4">
        <DataCard value={String(queue.length)} label="Awaiting review" />
        <DataCard value={String(counts.live ?? 0)} label="Live" />
        <DataCard value={String(counts.rejected ?? 0)} label="Changes requested" />
        <DataCard value={String(counts.expired ?? 0)} label="Expired" />
      </div>
      {sp.decided ? (
        <div className="col-span-12">
          <Status tone="human">
            {sp.decided === 'approve'
              ? 'Approved and published. The employer has been emailed.'
              : 'Changes requested. The employer has been emailed.'}
          </Status>
        </div>
      ) : null}

      <section aria-labelledby="queue" className="col-span-12 flex flex-col gap-4">
        <h2 id="queue" className="label-mono">
          Review queue
        </h2>
        {queue.length === 0 ? (
          <MeshPanel>
            <EmptyState>The queue is clear.</EmptyState>
          </MeshPanel>
        ) : (
          queue.map((l) => (
            <MeshPanel
              key={l.id}
              data-listing={l.id}
              eyebrow={`${levelLabel[l.mandate.level]} · ${workTypeLabel[l.mandate.workType]} · ${l.plan}`}
              title={l.mandate.title}
            >
              <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
                <div className="flex flex-col gap-4">
                  <p className="text-small text-text-2">
                    {l.companyName} · {l.companyIndustry} · {l.companyStage}
                  </p>
                  <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div className="flex flex-col gap-1">
                      <dt className="label-mono">Comp</dt>
                      <dd className="numeric text-small text-text">
                        {compLabel(
                          l.mandate.compMin,
                          l.mandate.compMax,
                          l.mandate.currency,
                          l.mandate.compBasis,
                        )}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="label-mono">Reports to</dt>
                      <dd className="text-small text-text">
                        {l.mandate.reportingLine ?? 'Not stated'}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="label-mono">Team</dt>
                      <dd className="numeric text-small text-text">{l.mandate.teamSize ?? '—'}</dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="label-mono">Location</dt>
                      <dd className="text-small text-text">
                        {l.mandate.remote ? 'Remote' : (l.mandate.location ?? l.mandate.market)}
                      </dd>
                    </div>
                  </dl>
                  {l.mandate.scope ? (
                    <p className="text-small text-text">{l.mandate.scope}</p>
                  ) : null}
                  {l.mandate.priorities.length ? (
                    <ol className="list-decimal space-y-1 pl-5 text-small text-text-2">
                      {l.mandate.priorities.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ol>
                  ) : null}
                </div>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    {l.paidAt ? (
                      <Status tone="good">Paid {date(l.paidAt)}</Status>
                    ) : (
                      <Status tone="critical">Unpaid · cannot go live</Status>
                    )}
                    {l.mandate.confirmedAt ? (
                      <Status tone="human">Mandate confirmed by employer</Status>
                    ) : (
                      <Status>Not confirmed</Status>
                    )}
                    {l.isSample ? <MonoLabel>Sample data</MonoLabel> : null}
                  </div>
                  <DecisionForm listingId={l.id} title={l.mandate.title} canApprove={!!l.paidAt} />
                </div>
              </div>
            </MeshPanel>
          ))
        )}
      </section>

      <MeshPanel className="col-span-12 lg:col-span-7" eyebrow="Recently live">
        <ul className="flex flex-col divide-y divide-line">
          {live.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-4 py-3 text-small">
              <Link
                href={`/jobs/${l.id}`}
                className="text-text hover:underline hover:underline-offset-4"
              >
                {l.mandate.title}, {l.companyName}
              </Link>
              <span className="label-mono">until {date(l.expiresAt)}</span>
            </li>
          ))}
        </ul>
      </MeshPanel>
      <MeshPanel className="col-span-12 lg:col-span-5" eyebrow="Recently expired">
        {expired.length === 0 ? (
          <EmptyState>None.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {expired.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-4 py-3 text-small">
                <span className="text-text-2">
                  {l.mandate.title}, {l.companyName}
                </span>
                <span className="label-mono">{date(l.expiresAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </MeshPanel>
    </DashboardFrame>
  );
}
