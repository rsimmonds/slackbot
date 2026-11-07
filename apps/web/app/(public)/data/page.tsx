import { brand, currencies, type CompBasis, type Currency } from '@cmobeat/config';
import { DataCard, MeshPanel, MonoLabel } from '@cmobeat/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ChartFigure,
  DataTable,
  Histogram,
  HorizontalBars,
  RangeBars,
} from '@/components/publication/charts';
import { PageHeader, PublicPage } from '@/components/publication/PageHeader';
import { getViewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { publicIndustries, publicMarkets } from '@/lib/publication/aggregates';
import { levelLabel, marketLabel, type Level } from '@/lib/publication/labels';
import {
  compBands,
  movesByIndustry,
  movesLastDays,
  type CompBand,
} from '@/lib/publication/queries';
import { sampleMedianTenure, sampleTenure } from '@/lib/publication/sample-tenure';

export const metadata: Metadata = {
  title: 'Data',
  description: `Open data on the CMO seat from ${brand.name}: moves by industry, comp ranges by level and market, and tenure.`,
  alternates: { canonical: '/data' },
};

const levelOrder: Level[] = ['vp_marketing', 'cmo', 'chief_growth_officer', 'fractional_cmo'];
const currencyName: Record<Currency, string> = {
  USD: 'US dollars',
  CAD: 'Canadian dollars',
  EUR: 'euros',
  GBP: 'pounds sterling',
};

const money = (currency: Currency) => {
  // en-US throughout so compact suffixes match (K, not k); the symbol still names the currency.
  const f = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 0,
  });
  return (n: number) => f.format(n);
};

/** One facet per currency and pay basis, so different currencies never share an axis. */
function facets(bands: CompBand[]) {
  const groups = new Map<string, { currency: Currency; basis: CompBasis; bands: CompBand[] }>();
  for (const b of bands) {
    const key = `${b.currency}:${b.compBasis}`;
    if (!groups.has(key)) groups.set(key, { currency: b.currency, basis: b.compBasis, bands: [] });
    groups.get(key)!.bands.push(b);
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      bands: g.bands.sort((a, b) => levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level)),
    }))
    .sort((a, b) =>
      a.basis === b.basis
        ? currencies.indexOf(a.currency) - currencies.indexOf(b.currency)
        : a.basis === 'annual'
          ? -1
          : 1,
    );
}

export default async function DataPage() {
  const viewer = await getViewer();
  const [industries, bands, last90, industryPages] = await asViewer(viewer, (tx) =>
    Promise.all([movesByIndustry(tx), compBands(tx), movesLastDays(tx, 90), publicIndustries(tx)]),
  );
  const totalMoves = industries.reduce((s, r) => s + r.n, 0);
  const listingsWithComp = bands.reduce((s, b) => s + b.n, 0);

  return (
    <PublicPage>
      <PageHeader
        eyebrow="Data"
        title="The CMO seat, in numbers."
        lede="Counts come from editor-approved moves and live listings, which must show comp. Every figure on this page is drawn from fictional sample data until launch."
      />

      <section
        aria-label="Headline figures"
        className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <DataCard
          value={String(totalMoves)}
          label="Moves tracked"
          footnote="Editor-approved, all time."
        />
        <DataCard value={String(last90)} label="Moves, last 90 days" />
        <DataCard
          value={String(listingsWithComp)}
          label="Live listings with comp"
          footnote="Comp is required to publish."
        />
        <DataCard
          value={sampleMedianTenure.toFixed(1)}
          unit="yrs"
          label="Median CMO tenure"
          footnote="Illustrative sample, not measured."
        />
      </section>

      <section aria-labelledby="moves-by-industry" className="mt-16 grid grid-cols-12 gap-8">
        <div className="col-span-12 flex flex-col gap-3 lg:col-span-4">
          <MonoLabel>Moves</MonoLabel>
          <h2 id="moves-by-industry" className="font-serif text-h2 text-text">
            Where the seat is turning over.
          </h2>
          <p className="text-small text-text-2">
            Appointments, departures and promotions by the company&apos;s industry.
          </p>
        </div>
        <div className="col-span-12 lg:col-span-8">
          <ChartFigure
            title="Moves by industry"
            subtitle={`${totalMoves} editor-approved moves`}
            table={
              <DataTable
                head={['Industry', 'Moves']}
                rows={industries.map((r) => [r.industry, r.n])}
              />
            }
            note="Sample data. All companies and people are fictional."
          >
            <HorizontalBars
              rows={industries.map((r) => ({ label: r.industry, value: r.n }))}
              unit="moves"
            />
          </ChartFigure>
        </div>
      </section>

      <section aria-labelledby="comp-ranges" className="mt-16 grid grid-cols-12 gap-8">
        <div className="col-span-12 flex flex-col gap-3 lg:col-span-4">
          <MonoLabel>Comp</MonoLabel>
          <h2 id="comp-ranges" className="font-serif text-h2 text-text">
            What the seat pays, by level and market.
          </h2>
          <p className="text-small text-text-2">
            Each row shows the median advertised range (the bar) and the full spread of listings
            (the line). Currencies are never converted or mixed; fractional roles are monthly
            retainers and are charted separately.
          </p>
        </div>
        <div className="col-span-12 flex flex-col gap-6 lg:col-span-8">
          {facets(bands).map((f) => {
            const fmt = money(f.currency);
            const basisLabel = f.basis === 'monthly_retainer' ? 'monthly retainer' : 'annual base';
            return (
              <ChartFigure
                key={`${f.currency}-${f.basis}`}
                title={`${f.currency} · ${basisLabel}`}
                subtitle={`Advertised comp in ${currencyName[f.currency]}, ${f.bands.reduce((s, b) => s + b.n, 0)} live listings`}
                table={
                  <DataTable
                    head={['Level', 'Listings', 'Median min', 'Median max', 'Lowest', 'Highest']}
                    rows={f.bands.map((b) => [
                      levelLabel[b.level],
                      b.n,
                      fmt(b.medianMin),
                      fmt(b.medianMax),
                      fmt(b.lowest),
                      fmt(b.highest),
                    ])}
                  />
                }
              >
                <RangeBars
                  format={fmt}
                  rows={f.bands.map((b) => ({
                    label: levelLabel[b.level],
                    low: b.lowest,
                    high: b.highest,
                    bandLow: b.medianMin,
                    bandHigh: b.medianMax,
                    n: b.n,
                  }))}
                />
              </ChartFigure>
            );
          })}
          {bands.length === 0 ? (
            <p className="text-small text-text-3">No live listings yet.</p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="tenure" className="mt-16 grid grid-cols-12 gap-8">
        <div className="col-span-12 flex flex-col gap-3 lg:col-span-4">
          <MonoLabel>Tenure</MonoLabel>
          <h2 id="tenure" className="font-serif text-h2 text-text">
            How long the seat lasts.
          </h2>
          <p className="text-small text-text-2">
            This chart is an illustration, not a measurement. Tenure needs both ends of a seat, and
            the archive does not hold enough of them yet. It will be replaced with measured data.
          </p>
        </div>
        <div className="col-span-12 lg:col-span-8">
          <ChartFigure
            title="Completed CMO tenures"
            subtitle={`${sampleTenure.label}. Median ${sampleMedianTenure.toFixed(1)} years.`}
            table={
              <DataTable
                head={['Years in seat', 'Seats']}
                rows={sampleTenure.bins.map(([lo, n]) => [
                  `${lo}–${lo + sampleTenure.binWidth}`,
                  n,
                ])}
              />
            }
            note="Illustrative sample. Not measured data."
          >
            <Histogram bins={sampleTenure.bins} binWidth={sampleTenure.binWidth} unit="years" />
          </ChartFigure>
        </div>
      </section>

      <section aria-labelledby="explore" className="mt-16 grid grid-cols-12 gap-8">
        <div className="col-span-12 flex flex-col gap-3 lg:col-span-4">
          <MonoLabel>Explore</MonoLabel>
          <h2 id="explore" className="font-serif text-h2 text-text">
            By industry and market.
          </h2>
          <p className="text-small text-text-2">
            Each page has quotable figures, a citation and a CSV of the aggregates.
          </p>
        </div>
        <div className="col-span-12 grid gap-8 sm:grid-cols-2 lg:col-span-8">
          <nav aria-label="Data by market" className="flex flex-col gap-2">
            <MonoLabel>Markets</MonoLabel>
            <ul className="flex flex-col divide-y divide-line border-y border-line">
              {publicMarkets.map((m) => (
                <li key={m}>
                  <Link
                    href={`/data/markets/${m.toLowerCase()}`}
                    className="flex justify-between py-2 text-small text-text-2 hover:text-text"
                  >
                    {marketLabel[m]}
                    <span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Data by industry" className="flex flex-col gap-2">
            <MonoLabel>Industries</MonoLabel>
            <ul className="flex flex-col divide-y divide-line border-y border-line">
              {industryPages.map((i) => (
                <li key={i.slug}>
                  <Link
                    href={`/data/industries/${i.slug}`}
                    className="flex justify-between py-2 text-small text-text-2 hover:text-text"
                  >
                    {i.industry}
                    <span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      <section aria-labelledby="report" className="mt-16 grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-8 lg:col-start-5">
          <MeshPanel eyebrow="Annual report" title={brand.annualReport}>
            <p id="report" className="text-small text-text-2">
              The year in one document: moves by type, industry and market, what the seat pays, and
              how every number was made.
            </p>
            <p className="mt-4">
              <Link
                href="/data/report"
                className="text-small text-text underline underline-offset-4"
              >
                Get the report (free PDF)
              </Link>
            </p>
          </MeshPanel>
          <p className="mt-6 text-micro text-text-3">
            Quoting this page? Cite &ldquo;{brand.name}, Data&rdquo; with a link. Figures update as
            editors approve new moves and listings.
          </p>
        </div>
      </section>
    </PublicPage>
  );
}
