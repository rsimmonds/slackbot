import { Button, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import {
  formatAmount,
  isAdmin,
  listSponsorships,
  placementLabel,
  statusOf,
  type Placement,
} from '@/lib/sponsorships';
import { endSponsorshipAction } from './actions';
import { AdminOnly } from './AdminOnly';

export const metadata = { title: 'Sponsorships' };

const statusTone = { active: 'good', scheduled: 'neutral', ended: 'neutral' } as const;

export default async function SponsorshipsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; overlaps?: string; ended?: string }>;
}) {
  const viewer = await requireArea('staff');
  if (!isAdmin(viewer)) return <AdminOnly />;
  const { saved, overlaps, ended } = await searchParams;
  const rows = await listSponsorships(viewer);

  return (
    <DashboardFrame
      eyebrow="Sponsorships"
      title="Placements"
      lede="Plain text and one link. Clearly labelled, no scripts, no pixels, and never any reader or candidate data."
      aside={
        <Button asChild variant="secondary">
          <Link href="/console/sponsorships/new">Book a sponsorship</Link>
        </Button>
      }
    >
      {saved || ended ? (
        <div role="status" className="col-span-12 flex flex-col gap-2">
          <Status tone="human">{ended ? 'Ended. It no longer shows.' : 'Saved.'}</Status>
          {overlaps ? (
            <p className="text-small text-filament-ink">
              Overlaps with {overlaps} on the same placement. The most recent start date shows
              first.
            </p>
          ) : null}
        </div>
      ) : null}

      <MeshPanel
        className="col-span-12"
        eyebrow="All bookings"
        title={`${rows.length} sponsorships`}
      >
        {rows.length === 0 ? (
          <EmptyState>No sponsorships booked yet.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line border-t border-line">
            {rows.map((r) => {
              const status = statusOf(r);
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link
                      href={`/console/sponsorships/${r.id}`}
                      className="text-small text-text underline-offset-4 hover:underline"
                    >
                      {r.sponsorName}
                    </Link>
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <Status tone={statusTone[status]}>{status}</Status>
                      <MonoLabel>
                        {placementLabel[r.placement as Placement] ?? r.placement}
                      </MonoLabel>
                      <MonoLabel>
                        {r.startDate} → {r.endDate}
                      </MonoLabel>
                      <MonoLabel>{formatAmount(r.amount, r.currency)}</MonoLabel>
                    </span>
                  </div>
                  {status !== 'ended' ? (
                    <form action={endSponsorshipAction.bind(null, r.id)}>
                      <Button
                        type="submit"
                        variant="danger"
                        size="sm"
                        aria-label={`End sponsorship for ${r.sponsorName}`}
                      >
                        {status === 'scheduled' ? 'Cancel' : 'End now'}
                      </Button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </MeshPanel>
    </DashboardFrame>
  );
}
