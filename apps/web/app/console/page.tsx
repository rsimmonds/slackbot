import { DataCard, MeshPanel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { asViewer } from '@/lib/db';
import { listingCounts } from '@/lib/jobs/moderation';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';

export const metadata = { title: 'Staff console' };

export default async function ConsoleHome() {
  const viewer = await requireArea('staff');
  const isEditor = viewer.roles.includes('editor') || viewer.roles.includes('admin');
  const listingsInReview = (await asViewer(viewer, listingCounts)).pending_review ?? 0;
  const isTalent = viewer.roles.includes('talent_partner') || viewer.roles.includes('admin');
  return (
    <DashboardFrame
      eyebrow="Staff console"
      title="Nothing reaches a reader, employer or candidate without you."
      lede="Agents draft and propose. You approve. Every decision is logged."
    >
      <div className="col-span-12 grid gap-6 md:grid-cols-4">
        <DataCard value="0" label="Drafts awaiting edit" />
        <DataCard value="0" label="Matches awaiting review" />
        <DataCard value="0" label="Agent runs today" />
        <DataCard value="$0.00" label="Agent cost today" />
      </div>
      {isEditor ? (
        <MeshPanel
          className="col-span-12 lg:col-span-6"
          eyebrow="Editorial"
          title="Queue"
          actions={<Status tone="machine">Moves Tracker idle</Status>}
        >
          <EmptyState>
            AI-drafted moves and articles arrive here with sources. Opens in Phase 1.
          </EmptyState>
        </MeshPanel>
      ) : null}
      {isTalent ? (
        <MeshPanel
          className="col-span-12 lg:col-span-6"
          eyebrow="Matching"
          title="Match review"
          actions={<Status>Phase 3</Status>}
        >
          <EmptyState>
            Every proposed match, its rationale and audit trail. You approve, edit or reject.
          </EmptyState>
        </MeshPanel>
      ) : null}
      <MeshPanel
        className="col-span-12"
        eyebrow="Listings"
        title={`${listingsInReview} awaiting review`}
        actions={
          <Link href="/console/listings" className="text-small text-text-2 hover:text-text">
            Open queue
          </Link>
        }
      >
        <EmptyState>Paid job posts wait here until a person approves them.</EmptyState>
      </MeshPanel>
      <MeshPanel className="col-span-12" eyebrow="Agents" title="Monitoring">
        <EmptyState>Run logs, cost, eval scores and fairness reports per agent.</EmptyState>
      </MeshPanel>
    </DashboardFrame>
  );
}
