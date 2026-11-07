import { Button, Input, MonoLabel, MovesFeed } from '@cmobeat/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader, PublicPage } from '@/components/publication/PageHeader';
import { getViewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import {
  marketLabel,
  moveTypeLabel,
  type MarketCode,
  type MoveType,
} from '@/lib/publication/labels';
import { movesHref, parseMoveFilters } from '@/lib/publication/move-filters';
import { moveFacets, searchMoves } from '@/lib/publication/queries';

export const metadata: Metadata = {
  title: 'CMO Moves',
  description:
    'Every tracked CMO, VP Marketing and Chief Growth Officer appointment and departure, with sources. Each move is approved by an editor.',
  alternates: { canonical: '/moves' },
};

const PAGE_SIZE = 30;
const selectClass =
  'h-10 w-full rounded-control border border-line bg-surface px-3 text-small text-text focus:border-synapse focus:outline-none';

export default async function MovesArchive({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { filters, page } = parseMoveFilters(await searchParams);
  const viewer = await getViewer();
  const [{ rows, total }, facets] = await asViewer(viewer, (tx) =>
    Promise.all([searchMoves(tx, filters, page, PAGE_SIZE), moveFacets(tx)]),
  );
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Object.keys(filters).length > 0;

  return (
    <PublicPage>
      <PageHeader
        eyebrow="CMO Moves"
        title="Who moved, and where."
        lede="Appointments, departures and promotions in the CMO seat. The tracker drafts each move from a public source; an editor approves it before it appears here."
      />

      <div className="mt-10 grid grid-cols-12 gap-8">
        <form
          method="get"
          action="/moves"
          aria-label="Filter moves"
          className="col-span-12 flex flex-col gap-5 lg:col-span-3"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="moves-q" className="label-mono">
              Search
            </label>
            <Input
              id="moves-q"
              name="q"
              type="search"
              defaultValue={filters.q}
              placeholder="Name, title or company"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="moves-type" className="label-mono">
              Move type
            </label>
            <select
              id="moves-type"
              name="type"
              defaultValue={filters.type ?? ''}
              className={selectClass}
            >
              <option value="">All types</option>
              {(Object.keys(moveTypeLabel) as MoveType[]).map((t) => (
                <option key={t} value={t}>
                  {moveTypeLabel[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="moves-industry" className="label-mono">
              Industry
            </label>
            <select
              id="moves-industry"
              name="industry"
              defaultValue={filters.industry ?? ''}
              className={selectClass}
            >
              <option value="">All industries</option>
              {facets.industries.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="moves-market" className="label-mono">
              Market
            </label>
            <select
              id="moves-market"
              name="market"
              defaultValue={filters.market ?? ''}
              className={selectClass}
            >
              <option value="">All markets</option>
              {(Object.keys(marketLabel) as MarketCode[]).map((m) => (
                <option key={m} value={m}>
                  {marketLabel[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="moves-company" className="label-mono">
              Company
            </label>
            <select
              id="moves-company"
              name="company"
              defaultValue={filters.company ?? ''}
              className={selectClass}
            >
              <option value="">All companies</option>
              {facets.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="label-mono mb-2">Effective date</legend>
            <div className="flex flex-col gap-1">
              <label htmlFor="moves-from" className="text-micro text-text-3">
                From
              </label>
              <Input id="moves-from" name="from" type="date" defaultValue={filters.from} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="moves-to" className="text-micro text-text-3">
                To
              </label>
              <Input id="moves-to" name="to" type="date" defaultValue={filters.to} />
            </div>
          </fieldset>
          <div className="flex items-center gap-3">
            <Button type="submit">Apply</Button>
            {filtered ? (
              <Link href="/moves" className="label-mono hover:text-text">
                Clear
              </Link>
            ) : null}
          </div>
        </form>

        <section aria-labelledby="results" className="col-span-12 lg:col-span-8 lg:col-start-5">
          <h2 id="results" className="sr-only">
            Results
          </h2>
          <MonoLabel role="status">
            {total} {total === 1 ? 'move' : 'moves'}
            {filtered
              ? total === 1
                ? ' matches these filters'
                : ' match these filters'
              : ' tracked'}
          </MonoLabel>
          <MovesFeed
            precision="day"
            className="mt-4"
            live={false}
            title="Archive"
            moves={rows.map((m) => ({
              id: m.id,
              at: m.effectiveDate,
              type: m.moveType,
              person: m.personName,
              title: m.title,
              company: m.company,
              href: `/moves/${m.id}`,
            }))}
          />
          {pages > 1 ? (
            <nav aria-label="Pages" className="mt-6 flex items-center justify-between">
              {page > 1 ? (
                <Link
                  href={movesHref(filters, page - 1)}
                  className="label-mono hover:text-text"
                  rel="prev"
                >
                  ← Newer
                </Link>
              ) : (
                <span />
              )}
              <MonoLabel>
                Page {page} of {pages}
              </MonoLabel>
              {page < pages ? (
                <Link
                  href={movesHref(filters, page + 1)}
                  className="label-mono hover:text-text"
                  rel="next"
                >
                  Older →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
          <p className="mt-10 text-small text-text-3">
            Know of a move we missed?{' '}
            <Link
              href="/moves/submit"
              className="text-text-2 underline underline-offset-4 hover:text-text"
            >
              Send a tip with a public source
            </Link>
            .
          </p>
        </section>
      </div>
    </PublicPage>
  );
}
