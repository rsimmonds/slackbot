import { formatComp, type Currency } from '@cmobeat/config';
import { FitRange, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { AiNotice } from '@/components/legal/AiNotice';
import { CandidateMatchActions } from '@/components/matches/CandidateMatchActions';
import { requireArea } from '@/lib/auth';
import { myMatches, recipientFor, revealFields } from '@/lib/matches/candidate';
import { levelLabel } from '@/lib/matches/shared';

export const metadata = { title: 'Your matches' };

const marketLabel: Record<string, string> = {
  US: 'United States',
  CA: 'Canada',
  EU: 'Europe',
  UK: 'United Kingdom',
};

export default async function CandidateMatches() {
  const viewer = await requireArea('candidate');
  const items = await myMatches(viewer);
  return (
    <DashboardFrame
      eyebrow="Candidate · private"
      title={items.length ? 'Roles a person thinks you fit.' : 'No matches yet.'}
      lede="Each match was suggested by AI and approved by a talent partner. The company is not named, and does not know who you are, unless you agree to an introduction."
    >
      <div className="col-span-12">
        <AiNotice />
      </div>
      {items.length === 0 ? (
        <MeshPanel className="col-span-12">
          <EmptyState>
            Matches appear here once your profile is visible for matching and a person has approved
            a match.
          </EmptyState>
        </MeshPanel>
      ) : (
        <ul className="col-span-12 flex flex-col gap-6" aria-label="Your matches">
          {items.map((m) => {
            const comp =
              m.role.compMin && m.role.compMax
                ? formatComp(
                    m.role.compMin,
                    m.role.compMax,
                    m.role.currency as Currency,
                    m.role.compBasis as 'annual' | 'monthly_retainer',
                  )
                : null;
            return (
              <li key={m.matchId}>
                <MeshPanel
                  eyebrow={
                    m.company.name ??
                    `${m.company.industry} · ${m.company.stage} · company not named`
                  }
                  title={m.role.title}
                  actions={
                    m.revealedNow ? (
                      <Status tone="human">Introduced</Status>
                    ) : (
                      <Status>Anonymous</Status>
                    )
                  }
                >
                  <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
                    <div className="flex flex-col gap-5">
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                        {[
                          ['Level', levelLabel[m.role.level] ?? m.role.level],
                          ['Reports to', m.role.reportingLine ?? '—'],
                          ['Comp', comp ?? '—'],
                          [
                            'Where',
                            `${marketLabel[m.role.market] ?? m.role.market}${m.role.remote ? ' · remote' : ''}`,
                          ],
                        ].map(([k, v]) => (
                          <div key={k} className="flex flex-col gap-1">
                            <dt className="label-mono">{k}</dt>
                            <dd className="numeric text-small text-text">{v}</dd>
                          </div>
                        ))}
                      </dl>
                      {m.role.scope ? (
                        <p className="text-small text-text-2">{m.role.scope}</p>
                      ) : null}
                      {m.rationale.summary ? (
                        <p className="text-small text-text">{m.rationale.summary}</p>
                      ) : null}
                      {m.rationale.reasons.length ? (
                        <div className="flex flex-col gap-2">
                          <MonoLabel>Why</MonoLabel>
                          <ul className="flex flex-col gap-2 text-small">
                            {m.rationale.reasons.map((r) => (
                              <li key={r.reason} className="flex gap-3">
                                <span aria-hidden className="numeric w-3 shrink-0 text-text-3">
                                  {r.direction === 'for' ? '+' : '–'}
                                </span>
                                <span
                                  className={r.direction === 'for' ? 'text-text' : 'text-text-2'}
                                >
                                  <span className="sr-only">
                                    {r.direction === 'for' ? 'Supports fit: ' : 'Against fit: '}
                                  </span>
                                  {r.reason}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-6">
                      <FitRange low={m.scoreLow} high={m.scoreHigh} />
                      <CandidateMatchActions
                        matchId={m.matchId}
                        roleTitle={m.role.title}
                        response={m.response}
                        pendingRequestId={m.pendingRequestId}
                        revealedNow={m.revealedNow}
                        revealed={m.status === 'revealed'}
                        recipient={recipientFor(m.company.industry)}
                        fields={[...revealFields]}
                      />
                    </div>
                  </div>
                </MeshPanel>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardFrame>
  );
}
