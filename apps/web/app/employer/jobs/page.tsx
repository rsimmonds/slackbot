import { Button, MeshPanel, MonoLabel, Status, type Tone } from '@cmobeat/ui';
import Link from 'next/link';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { employerCompany, employerListings } from '@/lib/jobs/posting';

export const metadata = { title: 'Your listings' };

const statusView: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending_payment: { label: 'Awaiting payment', tone: 'neutral' },
  pending_review: { label: 'With our editors', tone: 'human' },
  live: { label: 'Live', tone: 'good' },
  rejected: { label: 'Changes requested', tone: 'critical' },
  expired: { label: 'Expired', tone: 'neutral' },
};

const date = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');

export default async function EmployerListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; resubmitted?: string; submitted?: string }>;
}) {
  const viewer = await requireArea('employer');
  const sp = await searchParams;
  const { company, rows } = await asViewer(viewer, async (tx) => {
    const company = await employerCompany(tx, viewer.id);
    return { company, rows: company ? await employerListings(tx, company.id) : [] };
  });

  return (
    <DashboardFrame
      eyebrow={company ? `Employer · ${company.name}` : 'Employer'}
      title="Your listings"
      lede="Every listing is read by a person before it goes live. Live listings run for 60 days."
      aside={
        <Button asChild>
          <Link href="/employer/jobs/new">Post a job</Link>
        </Button>
      }
    >
      {sp.paid || sp.resubmitted || sp.submitted ? (
        <div className="col-span-12">
          <Status tone="human">
            {sp.paid
              ? 'Payment received. A person will review your listing, usually within one business day.'
              : sp.submitted
                ? 'Submitted under your subscription. A person will review it, usually within one business day.'
                : 'Resubmitted. Our editors will review your changes.'}
          </Status>
        </div>
      ) : null}
      <MeshPanel
        className="col-span-12"
        eyebrow={`${rows.length} ${rows.length === 1 ? 'listing' : 'listings'}`}
      >
        {rows.length === 0 ? (
          <EmptyState>No listings yet. Paste a job description to start.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-small">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="label-mono py-3 font-normal">
                    Role
                  </th>
                  <th scope="col" className="label-mono py-3 font-normal">
                    Status
                  </th>
                  <th scope="col" className="label-mono py-3 font-normal">
                    Plan
                  </th>
                  <th scope="col" className="label-mono py-3 font-normal">
                    Live until
                  </th>
                  <th scope="col" className="label-mono py-3 font-normal">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const view = statusView[r.status] ?? { label: r.status, tone: 'neutral' as Tone };
                  const editable =
                    r.status === 'draft' ||
                    r.status === 'pending_payment' ||
                    r.status === 'rejected';
                  return (
                    <tr key={r.id} data-listing={r.id}>
                      <td className="py-4 pr-4">
                        <span className="text-text">{r.title}</span>
                        {r.status === 'rejected' && r.moderationNote ? (
                          <p className="mt-1 max-w-md text-micro text-text-2">{r.moderationNote}</p>
                        ) : null}
                      </td>
                      <td className="py-4 pr-4">
                        <Status tone={view.tone}>{view.label}</Status>
                      </td>
                      <td className="py-4 pr-4">
                        <MonoLabel>{r.plan}</MonoLabel>
                      </td>
                      <td className="numeric py-4 pr-4 text-text-2">{date(r.expiresAt)}</td>
                      <td className="py-4 text-right">
                        {r.status === 'live' ? (
                          <Link href={`/jobs/${r.id}`} className="text-text-2 hover:text-text">
                            View
                          </Link>
                        ) : editable ? (
                          <Link
                            href={`/employer/jobs/${r.id}/edit`}
                            className="text-text-2 hover:text-text"
                          >
                            {r.status === 'rejected' ? 'Edit and resubmit' : 'Continue'}
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </MeshPanel>
    </DashboardFrame>
  );
}
