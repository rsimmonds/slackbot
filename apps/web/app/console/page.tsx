import { Button, DataCard, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { asViewer } from '@/lib/db';
import { listingCounts } from '@/lib/jobs/moderation';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { isEditorial } from '@/lib/editorial/access';
import { articleCounts } from '@/lib/editorial/articles';
import { moveCounts } from '@/lib/editorial/moves';
import { formatCost, openQueue, summaryByAgent } from '@/lib/agents/monitoring';
import { proposedCount } from '@/lib/matches/review';

export const metadata = { title: 'Staff console' };

export default async function ConsoleHome() {
  const viewer = await requireArea('staff');
  const isEditor = isEditorial(viewer);
  const listingsInReview = (await asViewer(viewer, listingCounts)).pending_review ?? 0;
  const isTalent = viewer.roles.includes('talent_partner') || viewer.roles.includes('admin');
  const matchesWaiting = isTalent ? await proposedCount(viewer) : 0;
  const [moves, articles] = isEditor
    ? await Promise.all([moveCounts(viewer), articleCounts(viewer)])
    : [null, null];
  const waiting = (moves?.drafts ?? 0) + (articles?.inReview ?? 0);
  const [agentSummary, agentQueue] = await Promise.all([
    summaryByAgent(viewer, 1),
    openQueue(viewer),
  ]);
  const runsToday = agentSummary.reduce((s, a) => s + a.runs, 0);
  const costToday = agentSummary.reduce((s, a) => s + a.costMicros, 0);

  return (
    <DashboardFrame
      eyebrow="Staff console"
      title="Nothing reaches a reader, employer or candidate without you."
      lede="Agents draft and propose. You approve. Every decision is logged."
    >
      {isEditor && moves && articles ? (
        <div className="col-span-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/console/editorial?tab=moves" className="rounded-panel">
            <DataCard value={String(moves.drafts)} label="Moves awaiting review" />
          </Link>
          <Link href="/console/editorial?tab=articles" className="rounded-panel">
            <DataCard value={String(articles.inReview)} label="Articles in review" />
          </Link>
          <DataCard
            value={String(moves.approvedThisWeek + articles.publishedThisWeek)}
            label="Published this week"
            footnote={`${moves.approvedThisWeek} moves · ${articles.publishedThisWeek} articles`}
          />
          <Link href="/console/listings" className="rounded-panel">
            <DataCard value={String(listingsInReview)} label="Listings awaiting moderation" />
          </Link>
        </div>
      ) : null}

      {isEditor ? (
        <MeshPanel
          className="col-span-12 lg:col-span-6"
          eyebrow="Editorial"
          title={waiting ? `${waiting} item${waiting === 1 ? '' : 's'} waiting` : 'Queue clear'}
          actions={<Status tone="machine">Moves Tracker monitoring</Status>}
        >
          <p className="text-small text-text-2">
            {waiting
              ? 'Drafts from the Moves Tracker and articles from writers. Check each against its sources.'
              : 'Nothing is waiting. New drafts arrive here with their sources.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="secondary" size="sm">
              <Link href="/console/editorial">Open queue</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/console/editorial/articles/new">New article</Link>
            </Button>
          </div>
          {articles?.drafts ? (
            <MonoLabel className="mt-4 block">{articles.drafts} drafts in progress</MonoLabel>
          ) : null}
        </MeshPanel>
      ) : null}
      {isTalent ? (
        <MeshPanel
          className="col-span-12 lg:col-span-6"
          eyebrow="Matching"
          title={
            matchesWaiting
              ? `${matchesWaiting} match${matchesWaiting === 1 ? '' : 'es'} awaiting review`
              : 'No matches waiting'
          }
          actions={
            <Status tone={matchesWaiting ? 'machine' : 'neutral'}>
              {matchesWaiting ? 'Proposed by AI' : 'Clear'}
            </Status>
          }
        >
          <p className="text-small text-text-2">
            Every proposed match, its rationale and audit trail. You approve, edit or reject.
          </p>
          <div className="mt-6">
            <Button asChild variant="secondary" size="sm">
              <Link href="/console/matches">Open match review</Link>
            </Button>
          </div>
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
      <MeshPanel
        className="col-span-12"
        eyebrow="Agents"
        title={`${runsToday} runs in the last 24 hours · ${formatCost(costToday)}`}
        actions={
          <Link href="/console/agents" className="text-small text-text-2 hover:text-text">
            Open monitoring
          </Link>
        }
      >
        <EmptyState>
          {agentQueue.length
            ? `${agentQueue.length} item${agentQueue.length === 1 ? '' : 's'} waiting for a person. Run logs, cost and eval results are in monitoring.`
            : 'Nothing waiting for a person. Run logs, cost and eval results are in monitoring.'}
        </EmptyState>
      </MeshPanel>
    </DashboardFrame>
  );
}
