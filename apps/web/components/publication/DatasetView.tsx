import { brand, type Currency } from '@cmobeat/config';
import { DataCard, MeshPanel, MonoLabel } from '@cmobeat/ui';
import Link from 'next/link';
import { ChartFigure, DataTable, HorizontalBars } from '@/components/publication/charts';
import { JsonLd } from '@/components/publication/JsonLd';
import { PageHeader, PublicPage, SampleNote } from '@/components/publication/PageHeader';
import { MIN_CELL, pct } from '@/lib/publication/aggregates';
import { citation, datasetJsonLd, type Dataset } from '@/lib/publication/datasets';
import { levelLabel, marketLabel, moveTypeLabel } from '@/lib/publication/labels';

const money = (currency: Currency) => {
  const f = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 0,
  });
  return (n: number) => f.format(n);
};

/** A quotable data page for one industry or market. Server-rendered; aggregates only. */
export function DatasetView({ d, origin }: { d: Dataset; origin: string }) {
  const b = d.moves.byType;
  const breakdownLabel = d.kind === 'industry' ? 'Moves by market' : 'Moves by industry';
  return (
    <PublicPage>
      <JsonLd data={datasetJsonLd(d, origin)} />
      <PageHeader
        eyebrow={d.kind === 'industry' ? 'Data · Industry' : 'Data · Market'}
        title={d.name}
        lede={`CMO moves and advertised comp ${d.kind === 'industry' ? 'in' : 'for'} ${d.name}, from editor-approved moves and live listings. Every figure below is in the CSV.`}
        aside={
          <Link href="/data" className="label-mono hover:text-text">
            ← All data
          </Link>
        }
      />

      <section
        aria-label="Headline figures"
        className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <DataCard value={String(d.moves.total)} label="Moves tracked" footnote="Editor-approved." />
        <DataCard value={String(b.appointed)} label="Appointments" />
        <DataCard value={String(d.board.live)} label="Live senior roles" />
        <DataCard
          value={`${pct(d.board.withComp, d.board.live)}%`}
          label="Listings that state comp"
          footnote="Comp is required to publish."
        />
      </section>

      <section aria-labelledby="moves" className="mt-16 grid grid-cols-12 gap-8">
        <div className="col-span-12 flex flex-col gap-3 lg:col-span-4">
          <MonoLabel>Moves</MonoLabel>
          <h2 id="moves" className="font-serif text-h2 text-text">
            Who took the seat, and who left it.
          </h2>
        </div>
        <div className="col-span-12 flex flex-col gap-6 lg:col-span-8">
          <ChartFigure
            title="Moves by type"
            subtitle={`${d.moves.total} editor-approved moves`}
            table={
              <DataTable
                head={['Type', 'Moves']}
                rows={(['appointed', 'departed', 'promoted'] as const).map((t) => [
                  moveTypeLabel[t],
                  b[t],
                ])}
              />
            }
          >
            <HorizontalBars
              unit="moves"
              rows={(['appointed', 'departed', 'promoted'] as const).map((t) => ({
                label: moveTypeLabel[t],
                value: b[t],
              }))}
            />
          </ChartFigure>
          {d.moves.breakdown.length ? (
            <ChartFigure
              title={breakdownLabel}
              subtitle={`${d.moves.total} editor-approved moves`}
              table={
                <DataTable
                  head={[d.kind === 'industry' ? 'Market' : 'Industry', 'Moves']}
                  rows={d.moves.breakdown.map((r) => [r.key, r.n])}
                />
              }
            >
              <HorizontalBars
                unit="moves"
                rows={d.moves.breakdown.map((r) => ({ label: r.key, value: r.n }))}
              />
            </ChartFigure>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="comp" className="mt-16 grid grid-cols-12 gap-8">
        <div className="col-span-12 flex flex-col gap-3 lg:col-span-4">
          <MonoLabel>Comp</MonoLabel>
          <h2 id="comp" className="font-serif text-h2 text-text">
            What the seat pays.
          </h2>
          <p className="text-small text-text-2">
            Median advertised ranges from live listings. Currencies are never converted or mixed.
            Groups with fewer than {MIN_CELL} listings are withheld so no single listing can be read
            back.
          </p>
        </div>
        <div className="col-span-12 lg:col-span-8">
          {d.comp.cells.length ? (
            <DataTable
              head={['Level', 'Market', 'Basis', 'Median range', 'Listings']}
              rows={d.comp.cells.map((c) => {
                const fmt = money(c.currency);
                return [
                  levelLabel[c.level],
                  marketLabel[c.market],
                  c.compBasis === 'monthly_retainer' ? 'Monthly retainer' : 'Annual base',
                  `${fmt(c.medianMin)}–${fmt(c.medianMax)}`,
                  c.n,
                ];
              })}
            />
          ) : (
            <p className="text-small text-text-2">
              Not enough listings yet to publish a comp range here
              {d.comp.suppressed ? ` (${d.comp.suppressed} smaller groups withheld)` : ''}.
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="cite" className="mt-16 grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-8 lg:col-start-5">
          <MeshPanel eyebrow="Cite this" title="Quoting these numbers">
            <p id="cite" className="font-mono text-micro break-words text-text">
              {citation(d, origin)}
            </p>
            <p className="mt-4 text-small text-text-2">
              <a
                href={`${d.path}/data.csv`}
                download
                className="text-text underline underline-offset-4"
              >
                Download the CSV
              </a>{' '}
              (aggregates only). Method: moves are counted once an editor approves them, by the
              company&apos;s industry and market; comp comes from live listings, where a range is
              required. Figures update as editors approve new moves and listings. Report from{' '}
              {brand.name}:{' '}
              <Link href="/data/report" className="text-text underline underline-offset-4">
                {brand.annualReport}
              </Link>
              .
            </p>
          </MeshPanel>
          <div className="mt-6">
            <SampleNote />
          </div>
        </div>
      </section>
    </PublicPage>
  );
}
