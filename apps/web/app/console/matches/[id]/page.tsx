import { formatComp, type Currency } from '@cmobeat/config';
import { MatchDossier, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { uuidPattern } from '@/lib/api';
import { requireArea } from '@/lib/auth';
import { getDossier } from '@/lib/matches/review';
import { isTalent, levelLabel, MatchError, responseLabel } from '@/lib/matches/shared';
import { ReviewForm } from './ReviewForm';

export const metadata = { title: 'Match dossier' };

const actionLabel: Record<string, string> = {
  'match.propose': 'Proposed by the Matcher',
  'match.rationale_edit': 'Rationale edited',
  'match.approve': 'Approved',
  'match.reject': 'Rejected',
  'match.respond': 'Candidate answered',
  'reveal.request': 'Employer asked for an introduction',
  'reveal.consent': 'Candidate consented to the introduction',
  'reveal.decline': 'Candidate declined the introduction',
  'reveal.withdraw': 'Candidate withdrew the introduction',
  'message.send': 'Message sent',
};

const actorLabel = {
  you: 'You',
  staff: 'Talent partner',
  candidate: 'Candidate',
  employer: 'Employer',
  system: 'System',
} as const;

export default async function MatchDossierPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireArea('staff');
  const { id } = await params;
  if (!uuidPattern.test(id) || !isTalent(viewer)) notFound();
  let d;
  try {
    d = await getDossier(viewer, id);
  } catch (e) {
    if (e instanceof MatchError && e.status === 404) notFound();
    throw e;
  }
  const { match: m, mandate: md, profile: p } = d;
  const ideal = (p?.idealMandate ?? {}) as {
    summary?: string;
    workTypes?: string[];
    markets?: string[];
    stages?: string[];
  };

  return (
    <DashboardFrame
      eyebrow={`Match · ${md.companyName}`}
      title={md.title}
      lede="Check the reasons against the outcomes. Approve only what you would defend to the candidate and the board."
      aside={
        <Link href="/console/matches" className="label-mono hover:text-text">
          ← Back to queue
        </Link>
      }
    >
      <div className="col-span-12">
        <MatchDossier
          mandate={{
            heading: md.title,
            facts: [
              { label: 'Company', value: md.companyName },
              { label: 'Reports to', value: md.reportingLine ?? '—' },
              { label: 'Team', value: md.teamSize ? String(md.teamSize) : '—' },
              {
                label: 'Comp',
                value:
                  md.compMin && md.compMax
                    ? formatComp(
                        md.compMin,
                        md.compMax,
                        md.currency as Currency,
                        md.compBasis as 'annual' | 'monthly_retainer',
                      )
                    : '—',
              },
            ],
            points: md.priorities,
          }}
          profile={{
            heading: p?.headline ?? 'Profile not visible',
            facts: [
              { label: 'Level', value: p?.level ? (levelLabel[p.level] ?? p.level) : '—' },
              { label: 'Years', value: p?.yearsExperience ? String(p.yearsExperience) : '—' },
              {
                label: 'Work type',
                value: ideal.workTypes?.length ? ideal.workTypes.join(', ').replace('_', '-') : '—',
              },
              { label: 'Markets', value: ideal.markets?.join(', ') || '—' },
            ],
            points: [
              ...(p?.outcomes ?? []).map(
                (o) => `${o.metric}: ${o.value}${o.context ? ` (${o.context})` : ''}`,
              ),
              ...(p?.teamBuilds ?? []).map((t) => `Team: ${t}`),
              ...(p?.aiFluency ? [`AI: ${p.aiFluency}`] : []),
            ],
          }}
          scoreLow={m.scoreLow}
          scoreHigh={m.scoreHigh}
          rationale={
            m.rationale.reasons.length
              ? m.rationale.reasons
              : [{ reason: m.rationale.summary || 'No reasons given.', direction: 'for' }]
          }
          status={m.status}
          review={
            m.reviewedAt
              ? { reviewer: m.reviewedByMe ? 'You' : 'A talent partner', at: m.reviewedAt }
              : undefined
          }
        />
      </div>

      <MeshPanel
        className="col-span-12 lg:col-span-7"
        eyebrow="Decision"
        title={m.status === 'proposed' ? 'Approve, edit or reject' : 'Reviewed'}
        actions={<Status tone={m.status === 'proposed' ? 'machine' : 'human'}>{m.status}</Status>}
      >
        {m.rationale.summary ? (
          <p className="mb-6 text-small text-text-2">{m.rationale.summary}</p>
        ) : null}
        {m.status === 'proposed' ? (
          <ReviewForm matchId={m.id} summary={m.rationale.summary} reasons={m.rationale.reasons} />
        ) : (
          <EmptyState>This match has been reviewed. Decisions are final and logged.</EmptyState>
        )}
        {ideal.summary ? (
          <div className="mt-6 flex flex-col gap-2 border-t border-line pt-6">
            <MonoLabel>Ideal next mandate, in the candidate&apos;s words</MonoLabel>
            <p className="text-small text-text-2">{ideal.summary}</p>
          </div>
        ) : null}
      </MeshPanel>

      <div className="col-span-12 flex flex-col gap-6 lg:col-span-5">
        <MeshPanel eyebrow="Candidate" title={responseLabel[m.candidateResponse] ?? 'Not answered'}>
          {m.candidateNote ? (
            <blockquote className="border-l border-filament/60 pl-4 text-small text-text">
              {m.candidateNote}
            </blockquote>
          ) : (
            <EmptyState>
              Candidates see a match only after you approve it. Their answer appears here.
            </EmptyState>
          )}
        </MeshPanel>
        <MeshPanel eyebrow="Audit trail" title="Every step, in order">
          <ol className="flex flex-col divide-y divide-line">
            {d.trail.map((t, i) => (
              <li key={i} className="flex items-start justify-between gap-4 py-3">
                <span className="flex flex-col gap-1">
                  <span className="text-small text-text">{actionLabel[t.action] ?? t.action}</span>
                  <MonoLabel>{actorLabel[t.actor]}</MonoLabel>
                </span>
                <time
                  dateTime={t.at.toISOString()}
                  className="numeric shrink-0 text-micro text-text-3"
                >
                  {t.at.toISOString().slice(0, 16).replace('T', ' ')}
                </time>
              </li>
            ))}
          </ol>
        </MeshPanel>
        <p className="text-micro text-text-3">
          The Matcher never sees names or personal attributes.{' '}
          <Link href="/legal/ai" className="underline underline-offset-4 hover:text-text">
            How AI is used
          </Link>
          .
        </p>
      </div>
    </DashboardFrame>
  );
}
