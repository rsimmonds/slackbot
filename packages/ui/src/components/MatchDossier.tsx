import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { HumanSeal } from './HumanSeal';
import { Status } from './Status';

export type MatchStatus = 'proposed' | 'approved' | 'rejected' | 'revealed';

export interface DossierSide {
  heading: string;
  /** Short facts (scope, team size, comp band). */
  facts: { label: string; value: string }[];
  /** Outcomes for a profile, priorities for a mandate. */
  points: string[];
}

export interface MatchDossierProps {
  mandate: DossierSide;
  profile: DossierSide;
  /** Fit as a range, 0–100. Never a single score. */
  scoreLow: number;
  scoreHigh: number;
  rationale: { reason: string; direction: 'for' | 'against' }[];
  status: MatchStatus;
  review?: { reviewer: string; at: string | Date };
  actions?: ReactNode;
  className?: string;
}

function Side({ side, tone }: { side: DossierSide; tone: 'mandate' | 'profile' }) {
  return (
    <div className="flex flex-col gap-5">
      <span className="label-mono">{tone === 'mandate' ? 'Mandate' : 'Profile · anonymized'}</span>
      <h3 className="font-serif text-h3 text-text">{side.heading}</h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        {side.facts.map((f) => (
          <div key={f.label} className="flex flex-col gap-1">
            <dt className="label-mono">{f.label}</dt>
            <dd className="numeric text-small text-text">{f.value}</dd>
          </div>
        ))}
      </dl>
      <ul className="flex flex-col gap-2 text-small text-text-2">
        {side.points.map((p) => (
          <li key={p} className="flex gap-3">
            <span aria-hidden className="mt-[0.7em] h-px w-3 shrink-0 bg-text-3" />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Fit shown as a range on a hairline track. */
export function FitRange({ low, high }: { low: number; high: number }) {
  const lo = Math.max(0, Math.min(100, low));
  const hi = Math.max(lo, Math.min(100, high));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="label-mono">Estimated fit</span>
        <span className="numeric text-small text-synapse-ink">
          {lo}–{hi}
        </span>
      </div>
      <div
        className="relative h-px w-full bg-line"
        role="img"
        aria-label={`Estimated fit between ${lo} and ${hi} out of 100`}
      >
        <span
          className="absolute -top-[2px] h-[5px] rounded-full bg-synapse/70"
          style={{ left: `${lo}%`, width: `${Math.max(1, hi - lo)}%` }}
        />
      </div>
      <div className="label-mono flex justify-between">
        <span>0</span>
        <span>100</span>
      </div>
    </div>
  );
}

const statusTone = {
  proposed: 'machine',
  approved: 'human',
  rejected: 'critical',
  revealed: 'human',
} as const;
const statusText = {
  proposed: 'Proposed by AI · awaiting human review',
  approved: 'Approved',
  rejected: 'Rejected',
  revealed: 'Identity revealed with consent',
} as const;

/**
 * Mandate versus profile, the plain-language rationale, fit as a range, and an amber
 * Human Review seal that appears only once a person approves.
 */
export function MatchDossier({
  mandate,
  profile,
  scoreLow,
  scoreHigh,
  rationale,
  status,
  review,
  actions,
  className,
}: MatchDossierProps) {
  const reviewed = (status === 'approved' || status === 'revealed') && review;
  return (
    <article className={cn('mesh flex flex-col gap-8 p-8', className)}>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Status tone={statusTone[status]}>{statusText[status]}</Status>
        {reviewed ? <HumanSeal reviewer={review.reviewer} at={review.at} /> : null}
      </header>

      <div className="grid gap-10 md:grid-cols-2 md:divide-x md:divide-line">
        <Side side={mandate} tone="mandate" />
        <div className="md:pl-10">
          <Side side={profile} tone="profile" />
        </div>
      </div>

      <div className="grid gap-8 border-t border-line pt-8 md:grid-cols-[1fr_2fr]">
        <FitRange low={scoreLow} high={scoreHigh} />
        <div className="flex flex-col gap-3">
          <span className="label-mono">Why</span>
          <ul className="flex flex-col gap-2 text-small">
            {rationale.map((r) => (
              <li key={r.reason} className="flex gap-3">
                <span
                  aria-hidden
                  className={cn(
                    'numeric w-3 shrink-0',
                    r.direction === 'for' ? 'text-text' : 'text-text-3',
                  )}
                >
                  {r.direction === 'for' ? '+' : '–'}
                </span>
                <span className={r.direction === 'for' ? 'text-text' : 'text-text-2'}>
                  <span className="sr-only">
                    {r.direction === 'for' ? 'Supports fit: ' : 'Against fit: '}
                  </span>
                  {r.reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {actions ? (
        <footer className="flex flex-wrap gap-3 border-t border-line pt-6">{actions}</footer>
      ) : null}
    </article>
  );
}
