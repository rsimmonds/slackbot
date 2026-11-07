import { MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { isEditorial } from '@/lib/editorial/access';
import { age, moveTypeLabel } from '@/lib/editorial/format';
import { confidenceLabel, getMoveForReview } from '@/lib/editorial/moves';
import { MoveReviewForm } from './MoveReviewForm';

export const metadata = { title: 'Review move' };

const kindLabel = {
  newsroom: 'Company newsroom',
  wire: 'Press wire',
  edgar: 'SEC EDGAR',
  submission: 'Reader submission',
} as const;

export default async function MoveReview({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireArea('staff');
  if (!isEditorial(viewer)) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getMoveForReview(viewer, id);
  if (!data) notFound();
  const { move, sourceItems, companies } = data;
  const conf = confidenceLabel(move.confidence);
  const aiDrafted = !!move.agentRunId || move.confidence !== null;
  const locked = move.status === 'approved';

  return (
    <DashboardFrame
      eyebrow={`Editorial · Move · ${move.status === 'draft' ? 'Draft' : move.status === 'approved' ? 'Published' : 'Rejected'}`}
      title={`${move.personName}, ${moveTypeLabel[move.moveType].toLowerCase()}`}
      lede={`${move.title}, ${move.companyName}. Check the claim against every source before you approve it.`}
      aside={
        <Link href="/console/editorial" className="label-mono hover:text-text">
          ← Back to queue
        </Link>
      }
    >
      <div className="col-span-12 flex flex-col gap-6 lg:col-span-5">
        <MeshPanel
          eyebrow="Sources"
          title={`${move.sources.length} public source${move.sources.length === 1 ? '' : 's'}`}
        >
          <ul className="flex flex-col gap-5">
            {move.sources.map((s) => {
              const item = sourceItems.find((i) => i.url === s.url);
              return (
                <li
                  key={s.url}
                  className="flex flex-col gap-2 border-t border-line pt-4 first:border-t-0 first:pt-0"
                >
                  <MonoLabel>{kindLabel[s.kind as keyof typeof kindLabel] ?? s.kind}</MonoLabel>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-small break-words text-text underline decoration-line-strong underline-offset-4 hover:decoration-text"
                  >
                    {item?.title ?? s.label}
                  </a>
                  {item?.excerpt ? <p className="text-small text-text-2">{item.excerpt}</p> : null}
                  <span className="numeric text-micro break-all text-text-3">{s.url}</span>
                </li>
              );
            })}
          </ul>
        </MeshPanel>
        <MeshPanel eyebrow="Provenance">
          <div className="flex flex-col gap-3">
            {aiDrafted ? (
              <Status tone="machine">Drafted by Moves Tracker</Status>
            ) : (
              <Status>Submitted by a person</Status>
            )}
            {conf ? (
              <p className="text-small text-text-2">
                <span className="text-synapse-ink">{conf.label}</span>, roughly {conf.range} out of
                100. A starting point, not a verdict.
              </p>
            ) : null}
            <MonoLabel>Queued {age(move.createdAt)}</MonoLabel>
            {move.reviewNote ? (
              <p className="text-small text-text-2">Last note: {move.reviewNote}</p>
            ) : null}
          </div>
        </MeshPanel>
      </div>
      <div className="col-span-12 lg:col-span-7">
        {locked ? (
          <MeshPanel eyebrow="Published">
            <EmptyState>This move is live. Corrections arrive in a later phase.</EmptyState>
          </MeshPanel>
        ) : (
          <MoveReviewForm
            move={{
              id: move.id,
              personName: move.personName,
              companyId: move.companyId,
              moveType: move.moveType,
              title: move.title,
              previousRole: move.previousRole ?? '',
              effectiveDate: move.effectiveDate,
              summary: move.summary ?? '',
              sources: move.sources.map((s) => ({
                url: s.url,
                label: s.label,
                kind: s.kind as 'newsroom',
              })),
            }}
            companies={companies}
          />
        )}
      </div>
    </DashboardFrame>
  );
}
