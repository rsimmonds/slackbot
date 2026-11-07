import { cn } from '../lib/cn';
import { Status } from './Status';

export type MoveType = 'appointed' | 'departed' | 'promoted';

export interface MoveItem {
  id: string;
  at: string | Date;
  type: MoveType;
  person: string;
  title: string;
  company: string;
  href?: string;
}

const typeLabel: Record<MoveType, string> = {
  appointed: 'Appointed',
  departed: 'Departed',
  promoted: 'Promoted',
};
const typeInk: Record<MoveType, string> = {
  appointed: 'text-text',
  departed: 'text-text-2',
  promoted: 'text-text',
};

const stamp = (d: string | Date, precision: 'minute' | 'day') => {
  const date = typeof d === 'string' ? new Date(d) : d;
  return precision === 'day'
    ? date.toISOString().slice(0, 10)
    : date.toISOString().slice(0, 16).replace('T', ' ');
};

/** A live, timestamped monospace log of CMO appointments and departures. */
export function MovesFeed({
  moves,
  live = true,
  title = 'CMO Moves',
  precision = 'minute',
  className,
}: {
  moves: MoveItem[];
  live?: boolean;
  title?: string;
  /** "day" for date-only events such as effective dates, so no fake 00:00 time is shown. */
  precision?: 'minute' | 'day';
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn('font-mono text-micro', className)}>
      <header className="flex items-center justify-between border-b border-line pb-3">
        <span className="label-mono text-text-2">{title}</span>
        {live ? <Status tone="machine">Monitoring</Status> : <Status>Archive</Status>}
      </header>
      {moves.length === 0 ? (
        <p className="py-6 text-text-3">No moves recorded yet.</p>
      ) : (
        <ol className="divide-y divide-line">
          {moves.map((m) => {
            const body = (
              <>
                <time dateTime={new Date(m.at).toISOString()} className="shrink-0 text-text-3">
                  {stamp(m.at, precision)}
                </time>
                <span className={cn('w-20 shrink-0 uppercase tracking-[0.12em]', typeInk[m.type])}>
                  {typeLabel[m.type]}
                </span>
                <span className="min-w-0 text-text-2">
                  <span className="text-text">{m.person}</span> · {m.title}, {m.company}
                </span>
              </>
            );
            return (
              <li key={m.id}>
                {m.href ? (
                  <a
                    href={m.href}
                    className="flex gap-4 py-3 transition-colors duration-[240ms] hover:bg-concrete/40"
                  >
                    {body}
                  </a>
                ) : (
                  <div className="flex gap-4 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
