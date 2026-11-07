import { MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { matchableMandates, reviewQueue } from '@/lib/matches/review';
import { isTalent, responseLabel } from '@/lib/matches/shared';
import { RunMatching } from './RunMatching';

export const metadata = { title: 'Match review' };

const statusTone = {
  proposed: 'machine',
  approved: 'human',
  revealed: 'human',
  rejected: 'critical',
} as const;
const statusText = {
  proposed: 'Proposed by AI',
  approved: 'Approved',
  revealed: 'Introduced',
  rejected: 'Rejected',
} as const;

export default async function MatchReviewQueue({
  searchParams,
}: {
  searchParams: Promise<{ reviewed?: string }>;
}) {
  const viewer = await requireArea('staff');
  const { reviewed } = await searchParams;
  if (!isTalent(viewer))
    return (
      <DashboardFrame eyebrow="Matching" title="Match review is for talent partners.">
        <MeshPanel className="col-span-12">
          <EmptyState>Ask an admin if you need access.</EmptyState>
        </MeshPanel>
      </DashboardFrame>
    );

  const [groups, mandates] = await Promise.all([reviewQueue(viewer), matchableMandates(viewer)]);
  const waiting = groups.reduce((n, g) => n + g.proposed, 0);

  return (
    <DashboardFrame
      eyebrow="Matching"
      title={
        waiting
          ? `${waiting} match${waiting === 1 ? '' : 'es'} waiting for you.`
          : 'Nothing waiting.'
      }
      lede="The Matcher proposes. You decide. No employer sees a candidate until you approve the match, and no one learns who a candidate is without their consent."
      aside={
        reviewed ? (
          <p role="status">
            <Status tone={reviewed === 'approved' ? 'human' : 'neutral'}>Match {reviewed}</Status>
          </p>
        ) : null
      }
    >
      <section aria-labelledby="queue" className="col-span-12 flex flex-col gap-6 lg:col-span-8">
        <h2 id="queue" className="label-mono">
          Proposals by mandate
        </h2>
        {groups.length === 0 ? (
          <MeshPanel>
            <EmptyState>No matches yet. Run matching for a confirmed mandate.</EmptyState>
          </MeshPanel>
        ) : (
          groups.map((g) => (
            <MeshPanel
              key={g.mandate.id}
              eyebrow={g.mandate.companyName}
              title={g.mandate.title}
              actions={
                g.proposed ? (
                  <Status tone="machine">{g.proposed} to review</Status>
                ) : (
                  <Status>Reviewed</Status>
                )
              }
            >
              <ul className="flex flex-col divide-y divide-line border-t border-line">
                {g.matches.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/console/matches/${m.id}`}
                      className="flex flex-col gap-2 py-4 transition-colors duration-[240ms] hover:bg-concrete/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="flex flex-col gap-1">
                        <span className="text-small text-text">
                          {m.summary || 'No summary yet'}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <Status tone={statusTone[m.status]}>{statusText[m.status]}</Status>
                          {m.candidateResponse !== 'pending' ? (
                            <MonoLabel>Candidate: {responseLabel[m.candidateResponse]}</MonoLabel>
                          ) : null}
                        </span>
                      </span>
                      <span className="numeric shrink-0 text-small text-synapse-ink">
                        Fit {m.scoreLow}–{m.scoreHigh}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </MeshPanel>
          ))
        )}
      </section>

      <aside aria-labelledby="run" className="col-span-12 flex flex-col gap-6 lg:col-span-4">
        <h2 id="run" className="label-mono">
          Confirmed mandates
        </h2>
        <MeshPanel>
          {mandates.length === 0 ? (
            <EmptyState>No confirmed mandates yet.</EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {mandates.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-4 py-4">
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-small text-text">{m.title}</span>
                    <MonoLabel>
                      {m.companyName} · {m.matchCount} matched
                    </MonoLabel>
                  </span>
                  <RunMatching mandateId={m.id} title={m.title} />
                </li>
              ))}
            </ul>
          )}
        </MeshPanel>
        <p className="text-micro text-text-3">
          Matching is blind: the Matcher never sees names, photos, age, gender, nationality or other
          personal attributes.{' '}
          <Link href="/legal/ai" className="underline underline-offset-4 hover:text-text">
            How AI is used
          </Link>
          .
        </p>
      </aside>
    </DashboardFrame>
  );
}
