import { mandates } from '@cmobeat/db';
import { Button, DataCard, MeshPanel, Status } from '@cmobeat/ui';
import { and, eq, isNull } from 'drizzle-orm';
import Link from 'next/link';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { hasActiveEmployerSubscription } from '@/lib/billing/status';
import { asViewer } from '@/lib/db';
import { employerCompany, employerListings } from '@/lib/jobs/posting';
import { listEmployerSearches } from '@/lib/searches/service';
import { companyForEmployer } from '@/lib/users';

export const metadata = { title: 'Employer' };

export default async function EmployerHome() {
  const viewer = await requireArea('employer');
  const company = await companyForEmployer(viewer.id);
  const activeSearches = (await listEmployerSearches(viewer)).filter(
    (s) => s.status !== 'closed',
  ).length;
  const { rows, mandateCount, confirmedCount, companyId } = await asViewer(viewer, async (tx) => {
    const c = await employerCompany(tx, viewer.id);
    if (!c) return { rows: [], mandateCount: 0, confirmedCount: 0, companyId: null };
    const built = await tx
      .select({ confirmedAt: mandates.confirmedAt })
      .from(mandates)
      .where(
        and(
          eq(mandates.companyId, c.id),
          eq(mandates.source, 'builder'),
          isNull(mandates.deletedAt),
        ),
      );
    return {
      rows: await employerListings(tx, c.id),
      mandateCount: built.length,
      confirmedCount: built.filter((m) => m.confirmedAt).length,
      companyId: c.id,
    };
  });
  const subscribed = companyId ? await hasActiveEmployerSubscription(companyId) : false;
  const live = rows.filter((r) => r.status === 'live').length;
  const inReview = rows.filter((r) => r.status === 'pending_review').length;
  return (
    <DashboardFrame
      eyebrow={company ? `Employer · ${company}` : 'Employer'}
      title="Define the seat before you fill it."
      lede="Start with the mandate. The listing, the shortlist and the interview plan follow from it."
    >
      <MeshPanel
        className="col-span-12 lg:col-span-8"
        eyebrow="Mandate Builder"
        title={
          mandateCount
            ? `${mandateCount} mandate${mandateCount === 1 ? '' : 's'} · ${confirmedCount} confirmed`
            : 'No mandates yet'
        }
        actions={mandateCount ? <Status tone="human">Your decisions</Status> : undefined}
      >
        <EmptyState>
          A 15-question session with your CEO or board member produces a mandate, a 90-day
          scorecard, a comp benchmark and an interview plan.
        </EmptyState>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="human">
            <Link href="/employer/mandates/new">Start a session</Link>
          </Button>
          {mandateCount ? (
            <Button asChild variant="ghost">
              <Link href="/employer/mandates">View mandates</Link>
            </Button>
          ) : null}
          <Button asChild variant="secondary">
            <Link href="/employer/jobs/new">Post a job</Link>
          </Button>
        </div>
      </MeshPanel>
      <div className="col-span-12 grid gap-6 lg:col-span-4">
        <Link
          href="/employer/jobs"
          aria-label={`${live} live listings, ${inReview} in review. Manage listings`}
        >
          <DataCard
            value={String(live)}
            label="Live listings"
            footnote={inReview ? `${inReview} with our editors` : undefined}
          />
        </Link>
        <Link href="/employer/searches" className="rounded-panel">
          <DataCard value={String(activeSearches)} label="Active searches" />
        </Link>
      </div>
      <MeshPanel
        className="col-span-12 md:col-span-6"
        eyebrow="Plan"
        title={subscribed ? 'Subscription · unlimited posts' : 'Pay per post'}
        actions={subscribed ? <Status tone="human">Active</Status> : null}
      >
        <p className="text-small text-text-2">
          {subscribed
            ? 'Every job post is included. Each one is still reviewed by a person before it goes live.'
            : 'Subscribe for unlimited posts and seats for your hiring team.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="secondary" size="sm">
            <Link href="/employer/billing">Billing and plan</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/employer/team">Team and seats</Link>
          </Button>
        </div>
      </MeshPanel>
      <MeshPanel className="col-span-12 md:col-span-6" eyebrow="Searches" title="Shortlists">
        <EmptyState>
          Approved matches appear here anonymized. Identities are revealed only with the
          candidate&apos;s consent.
        </EmptyState>
      </MeshPanel>
    </DashboardFrame>
  );
}
