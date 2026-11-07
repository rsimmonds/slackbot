import { Button, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { isEditorial } from '@/lib/editorial/access';
import { bylines, listQueueArticles } from '@/lib/editorial/articles';
import { asViewer } from '@/lib/db';
import { age, articleStatusLabel, articleTypeLabel, moveTypeLabel } from '@/lib/editorial/format';
import { confidenceLabel, listMoveDrafts } from '@/lib/editorial/moves';

export const metadata = { title: 'Editorial queue' };

const doneMessage: Record<string, string> = {
  'move-approved': 'Move approved and published.',
  'move-rejected': 'Move rejected. It will not be published.',
  'article-published': 'Article published.',
  'article-rejected': 'Article returned to its author with your note.',
};

export default async function EditorialQueue({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; done?: string }>;
}) {
  const viewer = await requireArea('staff');
  const { tab = 'moves', done } = await searchParams;

  if (!isEditorial(viewer)) {
    return (
      <DashboardFrame
        eyebrow="Editorial"
        title="Editorial is for editors."
        lede="Ask an admin if you need access."
      >
        <span />
      </DashboardFrame>
    );
  }

  const [moveDrafts, queueArticles] = await Promise.all([
    listMoveDrafts(viewer),
    listQueueArticles(viewer),
  ]);
  const names = await asViewer(viewer, (tx) =>
    bylines(
      tx,
      queueArticles.map((a) => a.authorId),
    ),
  );
  const active = tab === 'articles' ? 'articles' : 'moves';
  const inReview = queueArticles.filter((a) => a.status === 'in_review').length;

  return (
    <DashboardFrame
      eyebrow="Editorial"
      title="Nothing publishes until you approve it."
      lede="Agents draft moves from public sources. Writers draft articles. You check, edit and decide."
      aside={
        <Button asChild variant="secondary">
          <Link href="/console/editorial/articles/new">New article</Link>
        </Button>
      }
    >
      {done && doneMessage[done] ? (
        <p role="status" className="col-span-12">
          <Status tone="human">{doneMessage[done]}</Status>
        </p>
      ) : null}

      <nav aria-label="Queue" className="col-span-12 flex gap-1 border-b border-line">
        {(
          [
            ['moves', `Moves`, moveDrafts.length],
            ['articles', `Articles`, queueArticles.length],
          ] as const
        ).map(([key, label, count]) => (
          <Link
            key={key}
            href={`/console/editorial?tab=${key}`}
            aria-current={active === key ? 'page' : undefined}
            className={
              active === key
                ? '-mb-px border-b border-text px-4 py-3 text-small text-text'
                : 'px-4 py-3 text-small text-text-2 hover:text-text'
            }
          >
            {label} <span className="numeric text-text-3">{count}</span>
          </Link>
        ))}
      </nav>

      {active === 'moves' ? (
        <MeshPanel className="col-span-12" padded={false}>
          {moveDrafts.length === 0 ? (
            <div className="p-6">
              <EmptyState>
                No drafts waiting. I&apos;ll queue new moves here as public sources report them.
              </EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {moveDrafts.map((m) => {
                const conf =
                  m.agentRunId || m.confidence !== null ? confidenceLabel(m.confidence) : null;
                return (
                  <li key={m.id}>
                    <Link
                      href={`/console/editorial/moves/${m.id}`}
                      className="grid gap-2 px-6 py-4 transition-colors duration-[240ms] hover:bg-concrete/40 md:grid-cols-[1fr_auto] md:items-center"
                    >
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-small text-text">
                          {m.personName} <span className="text-text-3">·</span>{' '}
                          {moveTypeLabel[m.moveType]} {m.title}, {m.companyName}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          {m.agentRunId || conf ? (
                            <Status tone="machine">Drafted by Moves Tracker</Status>
                          ) : (
                            <Status>Submitted</Status>
                          )}
                          {conf ? (
                            <MonoLabel className="text-synapse-ink">
                              {conf.label} · {conf.range}
                            </MonoLabel>
                          ) : null}
                          <MonoLabel>
                            {m.sources.length} source{m.sources.length === 1 ? '' : 's'}
                          </MonoLabel>
                        </span>
                      </span>
                      <MonoLabel>{age(m.createdAt)}</MonoLabel>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </MeshPanel>
      ) : (
        <MeshPanel className="col-span-12" padded={false}>
          {queueArticles.length === 0 ? (
            <div className="p-6">
              <EmptyState>
                No drafts in progress. Start one, or wait for a writer to submit.
              </EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {queueArticles.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/console/editorial/articles/${a.id}`}
                    className="grid gap-2 px-6 py-4 transition-colors duration-[240ms] hover:bg-concrete/40 md:grid-cols-[1fr_auto] md:items-center"
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="text-small text-text">{a.title}</span>
                      <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <Status
                          tone={
                            a.status === 'in_review'
                              ? 'human'
                              : a.status === 'rejected'
                                ? 'critical'
                                : 'neutral'
                          }
                        >
                          {articleStatusLabel[a.status]}
                        </Status>
                        <MonoLabel>{articleTypeLabel[a.type]}</MonoLabel>
                        {a.agentRunId ? <Status tone="machine">AI draft</Status> : null}
                        <MonoLabel>
                          {a.authorId === viewer.id
                            ? 'By you'
                            : `By ${names.get(a.authorId) ?? 'staff writer'}`}
                        </MonoLabel>
                      </span>
                    </span>
                    <MonoLabel>Updated {age(a.updatedAt)}</MonoLabel>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </MeshPanel>
      )}
      <p className="col-span-12 text-micro text-text-3">
        {inReview} article{inReview === 1 ? '' : 's'} waiting for an editor. Every decision is
        logged.
      </p>
    </DashboardFrame>
  );
}
