import { MonoLabel, Status, type Tone } from '@cmobeat/ui';
import type { TimelineEntry } from '@/lib/searches/service';

export const searchStatusTone: Record<string, Tone> = {
  scoping: 'neutral',
  sourcing: 'machine',
  shortlist: 'human',
  interviewing: 'human',
  placed: 'good',
  closed: 'neutral',
};

export const searchStatusText: Record<string, string> = {
  scoping: 'Scoping',
  sourcing: 'Sourcing',
  shortlist: 'Shortlist',
  interviewing: 'Interviewing',
  placed: 'Placed',
  closed: 'Closed',
};

export const invoiceTone = (status: string): Tone =>
  status === 'paid' ? 'good' : status === 'open' ? 'human' : 'neutral';

export const invoiceText = (status: string) =>
  status === 'paid' ? 'Paid' : status === 'open' ? 'Open' : status;

export const isoDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '—');

/** The search's status history as a quiet mono log. */
export function SearchTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (!entries.length) return <p className="text-small text-text-3">Nothing has happened yet.</p>;
  return (
    <ol className="flex flex-col divide-y divide-line" aria-label="Search history">
      {entries.map((e, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 py-3">
          <time
            dateTime={e.at.toISOString()}
            className="numeric w-36 shrink-0 text-micro text-text-3"
          >
            {e.at.toISOString().slice(0, 16).replace('T', ' ')}
          </time>
          <span className="text-small text-text">{e.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** The stages a search moves through, with the current one marked. */
export function SearchStages({ status }: { status: string }) {
  const stages = ['scoping', 'sourcing', 'shortlist', 'interviewing', 'placed'];
  const at = stages.indexOf(status);
  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Search stages">
      {stages.map((s, i) => (
        <li key={s} aria-current={s === status ? 'step' : undefined}>
          {s === status ? (
            <Status tone={searchStatusTone[s]}>{searchStatusText[s]}</Status>
          ) : (
            <MonoLabel className={i < at ? 'text-text-2' : undefined}>
              {searchStatusText[s]}
            </MonoLabel>
          )}
        </li>
      ))}
      {status === 'closed' ? (
        <li aria-current="step">
          <Status>Closed</Status>
        </li>
      ) : null}
    </ol>
  );
}
