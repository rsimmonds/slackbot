import { formatComp, type Currency } from '@cmobeat/config';
import { Button, MatchDossier, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { uuidPattern } from '@/lib/api';
import { requireArea } from '@/lib/auth';
import { employerMandate, shortlist } from '@/lib/matches/employer';
import { levelLabel, MatchError } from '@/lib/matches/shared';
import { RequestIntroduction } from './RequestIntroduction';

export const metadata = { title: 'Shortlist' };

export default async function ShortlistPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireArea('employer');
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  let mandate, items;
  try {
    mandate = await employerMandate(viewer, id);
    items = await shortlist(viewer, id);
  } catch (e) {
    if (e instanceof MatchError && e.status === 404) notFound();
    throw e;
  }

  return (
    <DashboardFrame
      eyebrow="Shortlist"
      title={mandate.title}
      lede="Every leader here was proposed by the Matcher and approved by a person. You see outcomes and fit, not identity. A candidate's name appears only if they agree to be introduced."
      aside={
        <Link href={`/employer/mandates/${id}`} className="label-mono hover:text-text">
          ← Mandate
        </Link>
      }
    >
      {items.length === 0 ? (
        <MeshPanel className="col-span-12" eyebrow="Shortlist" title="Nothing here yet">
          <EmptyState>
            A talent partner reviews every proposed match before it reaches you. Approved matches
            appear here.
          </EmptyState>
        </MeshPanel>
      ) : (
        <ul className="col-span-12 flex flex-col gap-8" aria-label="Approved matches">
          {items.map((it, i) => (
            <li key={it.matchId} aria-label={`Candidate ${i + 1}`}>
              <MatchDossier
                mandate={{
                  heading: mandate.title,
                  facts: [
                    { label: 'Reports to', value: mandate.reportingLine ?? '—' },
                    { label: 'Team', value: mandate.teamSize ? String(mandate.teamSize) : '—' },
                    {
                      label: 'Comp',
                      value:
                        mandate.compMin && mandate.compMax
                          ? formatComp(
                              mandate.compMin,
                              mandate.compMax,
                              mandate.currency as Currency,
                              mandate.compBasis,
                            )
                          : '—',
                    },
                  ],
                  points: mandate.priorities.slice(0, 4),
                }}
                profile={{
                  heading: it.candidate ? it.candidate.name : `Candidate ${i + 1} · anonymised`,
                  facts: [
                    { label: 'Level', value: it.level ? (levelLabel[it.level] ?? it.level) : '—' },
                    ...(it.candidate
                      ? [
                          { label: 'Email', value: it.candidate.email },
                          { label: 'Headline', value: it.candidate.headline ?? '—' },
                        ]
                      : []),
                  ],
                  points: it.rationale.summary ? [it.rationale.summary] : [],
                }}
                scoreLow={it.scoreLow}
                scoreHigh={it.scoreHigh}
                rationale={
                  it.rationale.reasons.length
                    ? it.rationale.reasons
                    : [
                        {
                          reason: it.rationale.summary || 'Approved by a talent partner.',
                          direction: 'for',
                        },
                      ]
                }
                status={it.identityRevealed ? 'revealed' : 'approved'}
                review={
                  it.reviewedAt
                    ? { reviewer: 'CMO Beat talent partner', at: it.reviewedAt }
                    : undefined
                }
                actions={
                  it.candidate ? (
                    <Button asChild variant="secondary">
                      <Link href={`/employer/mandates/${id}/shortlist/${it.matchId}/messages`}>
                        Message {it.candidate.name.split(' ')[0]}
                      </Link>
                    </Button>
                  ) : it.request?.decision === 'pending' ? (
                    <Status tone="human">Introduction requested · waiting for the candidate</Status>
                  ) : it.request?.decision === 'declined' ? (
                    <MonoLabel>The candidate chose not to be introduced</MonoLabel>
                  ) : it.request?.decision === 'accepted' ? (
                    <MonoLabel>The candidate withdrew the introduction</MonoLabel>
                  ) : (
                    <RequestIntroduction mandateId={id} matchId={it.matchId} />
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </DashboardFrame>
  );
}
