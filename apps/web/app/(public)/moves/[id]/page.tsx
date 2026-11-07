import { brand } from '@cmobeat/config';
import { MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/publication/JsonLd';
import { formatDate, isoDate, marketLabel, moveTypeLabel } from '@/lib/publication/labels';
import { loadMove } from '@/lib/publication/loaders';

type Props = { params: Promise<{ id: string }> };

const verb = { appointed: 'appointed', departed: 'departs as', promoted: 'promoted to' } as const;
const sourceKindLabel: Record<string, string> = {
  newsroom: 'Company newsroom',
  wire: 'Press wire',
  press_wire: 'Press wire',
  edgar: 'SEC filing',
  submission: 'Reader tip, verified',
};

const headline = (m: {
  personName: string;
  moveType: keyof typeof verb;
  title: string;
  company: string;
}) =>
  m.moveType === 'departed'
    ? `${m.personName} departs as ${m.title}, ${m.company}`
    : `${m.personName} ${verb[m.moveType]} ${m.title}, ${m.company}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const move = await loadMove(id);
  if (!move) return { title: 'Not found', robots: { index: false } };
  return {
    title: headline(move),
    description:
      move.summary ??
      `${moveTypeLabel[move.moveType]} ${formatDate(move.effectiveDate)}. Sources listed.`,
    alternates: { canonical: `/moves/${move.id}` },
  };
}

export default async function MovePage({ params }: Props) {
  const { id } = await params;
  const move = await loadMove(id);
  if (!move) notFound();

  // Person markup for public, editor-approved moves only (see LEGAL_REVIEW E3).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: move.personName,
    jobTitle: move.moveType === 'departed' ? undefined : move.title,
    worksFor:
      move.moveType === 'departed' ? undefined : { '@type': 'Organization', name: move.company },
    subjectOf: {
      '@type': 'NewsArticle',
      headline: headline(move),
      datePublished: (move.approvedAt ?? move.updatedAt).toISOString(),
      url: `https://${brand.domain}/moves/${move.id}`,
      publisher: { '@type': 'Organization', name: brand.name },
      citation: move.sources.map((s) => s.url),
    },
  };

  return (
    <main className="relative mx-auto max-w-[1280px] px-4 pt-12 pb-24 md:px-8 md:pt-16">
      <JsonLd data={jsonLd} />
      <article aria-labelledby="move-title" className="grid grid-cols-12 gap-8">
        <header className="col-span-12 flex flex-col gap-5 lg:col-span-8">
          <MonoLabel>
            <Link href="/moves" className="hover:text-text">
              CMO Moves
            </Link>{' '}
            · {moveTypeLabel[move.moveType]} ·{' '}
            <time dateTime={isoDate(move.effectiveDate)}>{formatDate(move.effectiveDate)}</time>
          </MonoLabel>
          <h1 id="move-title" className="font-serif text-h1 text-text">
            {headline(move)}
          </h1>
          {move.summary ? (
            <p className="max-w-2xl text-h4 font-normal text-text-2">{move.summary}</p>
          ) : null}
        </header>

        <div className="col-span-12 flex flex-col gap-8 lg:col-span-7">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-5 border-t border-line pt-6 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <dt className="label-mono">Person</dt>
              <dd className="text-small text-text">{move.personName}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="label-mono">Title</dt>
              <dd className="text-small text-text">{move.title}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="label-mono">Company</dt>
              <dd className="text-small text-text">
                <Link
                  href={`/moves?company=${move.companyId}`}
                  className="underline-offset-4 hover:underline"
                >
                  {move.company}
                </Link>
              </dd>
            </div>
            {move.previousRole ? (
              <div className="flex flex-col gap-1">
                <dt className="label-mono">Previously</dt>
                <dd className="text-small text-text">{move.previousRole}</dd>
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <dt className="label-mono">Industry</dt>
              <dd className="text-small text-text">
                <Link
                  href={`/moves?industry=${encodeURIComponent(move.industry)}`}
                  className="underline-offset-4 hover:underline"
                >
                  {move.industry}
                </Link>
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="label-mono">Market</dt>
              <dd className="text-small text-text">{marketLabel[move.market]}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="label-mono">Stage</dt>
              <dd className="text-small text-text">{move.companyStage}</dd>
            </div>
          </dl>
        </div>

        <aside className="col-span-12 flex flex-col gap-4 lg:col-span-4 lg:col-start-9">
          <MeshPanel
            eyebrow="Sources"
            title={`${move.sources.length} public ${move.sources.length === 1 ? 'source' : 'sources'}`}
          >
            <ol className="flex flex-col divide-y divide-line">
              {move.sources.map((s) => (
                <li key={s.url} className="flex flex-col gap-1 py-3">
                  <span className="label-mono">{sourceKindLabel[s.kind] ?? s.kind}</span>
                  <a
                    href={s.url}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                    className="text-small break-all text-text underline decoration-line-strong underline-offset-4 hover:decoration-text"
                  >
                    {s.label}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ol>
          </MeshPanel>
          {move.approvedAt ? (
            <Status tone="human">
              Approved by an editor · {formatDate(move.approvedAt, 'short')}
            </Status>
          ) : null}
          <p className="text-micro text-text-3">
            Drafted from public sources by the Moves Tracker and approved by a human editor. Spot an
            error?{' '}
            <Link href="/moves/submit" className="underline underline-offset-4 hover:text-text">
              Tell us
            </Link>
            .
          </p>
        </aside>
      </article>
    </main>
  );
}
