import { brand } from '@cmobeat/config';
import { DataCard, MeshPanel, MonoLabel } from '@cmobeat/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/publication/JsonLd';
import { PageHeader, PublicPage, SampleNote } from '@/components/publication/PageHeader';
import { consentText } from '@/lib/newsletter/service';
import { pct } from '@/lib/publication/aggregates';
import { REPORT_TITLE, reportData } from '@/lib/report/data';
import { ReportForm } from './ReportForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: REPORT_TITLE,
  description: `${REPORT_TITLE}: a year of CMO moves and advertised comp from ${brand.name}, with method notes. Free download.`,
  alternates: { canonical: '/data/report' },
};

const inside = [
  'Every editor-approved CMO move of the year, by type, industry and market.',
  'What the seat pays: median advertised ranges by level, market and currency.',
  'How transparent the market is: comp disclosure and fractional and remote roles.',
  'Method and limitations, in plain language, so every number can be checked.',
];

export default async function ReportPage() {
  const d = await reportData();
  return (
    <PublicPage>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Report',
          name: REPORT_TITLE,
          publisher: { '@type': 'Organization', name: brand.name },
          datePublished: d.asOf,
          about: 'Chief Marketing Officer appointments, departures and compensation',
        }}
      />
      <PageHeader
        eyebrow="Annual report"
        title={REPORT_TITLE}
        lede="Who took the seat, who left it, and what the role pays. A year of CMO moves and advertised comp, every figure reviewed by an editor."
      />

      <section aria-label="Headline figures" className="mt-10 grid gap-4 sm:grid-cols-3">
        <DataCard
          value={String(d.moves.total)}
          label={`Moves tracked in ${d.year}`}
          footnote="Editor-approved."
        />
        <DataCard
          value={`${pct(d.board.withComp, d.board.live)}%`}
          label="Live listings that state comp"
          footnote={`${d.board.live} live senior roles.`}
        />
        <DataCard
          value={d.tenure.median.toFixed(1)}
          unit="yrs"
          label="Median CMO tenure"
          footnote="Illustrative sample, not measured."
        />
      </section>

      <div className="mt-16 grid grid-cols-12 gap-8">
        <section aria-labelledby="inside" className="col-span-12 flex flex-col gap-4 lg:col-span-5">
          <MonoLabel>What is inside</MonoLabel>
          <h2 id="inside" className="font-serif text-h2 text-text">
            Four short chapters.
          </h2>
          <ul className="flex flex-col gap-3 text-small text-text-2">
            {inside.map((t) => (
              <li key={t} className="flex gap-3">
                <span aria-hidden className="mt-[0.7em] h-px w-3 shrink-0 bg-text-3" />
                {t}
              </li>
            ))}
          </ul>
          <p className="text-small text-text-2">
            Prefer the numbers directly? Every aggregate is on the{' '}
            <Link href="/data" className="text-text underline underline-offset-4">
              Data page
            </Link>
            , with CSVs.
          </p>
          <SampleNote />
        </section>
        <div className="col-span-12 lg:col-span-6 lg:col-start-7">
          <MeshPanel eyebrow="Free download" title="Get the report">
            <ReportForm newsletterConsent={consentText} />
          </MeshPanel>
        </div>
      </div>
    </PublicPage>
  );
}
