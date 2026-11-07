import { brand } from '@cmobeat/config';
import { MonoLabel } from '@cmobeat/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArticleCard } from '@/components/publication/ArticleCard';
import { PageHeader, PublicPage } from '@/components/publication/PageHeader';
import { getViewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { listArticles, type ArticleType } from '@/lib/publication/queries';

export const metadata: Metadata = {
  title: 'Stories and reports',
  description: `Reporting and analysis on the changing CMO mandate from ${brand.name}.`,
  alternates: { canonical: '/articles' },
};

const filters: { key: string; label: string; types: ArticleType[] }[] = [
  { key: 'all', label: 'All', types: ['story', 'report'] },
  { key: 'story', label: 'Stories', types: ['story'] },
  { key: 'report', label: 'Reports', types: ['report'] },
];

export default async function ArticlesIndex({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const active = filters.find((f) => f.key === type) ?? filters[0]!;
  const viewer = await getViewer();
  const articles = await asViewer(viewer, (tx) =>
    listArticles(tx, { types: active.types, limit: 48 }),
  );
  const [first, ...rest] = articles;

  return (
    <PublicPage>
      <PageHeader
        eyebrow="Stories and reports"
        title="The changing CMO seat."
        lede="Reporting on what boards hire CMOs to do, what the seat pays, and why it turns over. Every piece is reviewed by an editor."
      />
      <nav aria-label="Filter by type" className="mt-8 flex gap-2">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.key === 'all' ? '/articles' : `/articles?type=${f.key}`}
            aria-current={f.key === active.key ? 'page' : undefined}
            className={
              f.key === active.key
                ? 'label-mono rounded-control bg-concrete px-3 py-1.5 text-text'
                : 'label-mono rounded-control px-3 py-1.5 hover:text-text-2'
            }
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {first ? (
        <div className="mt-10 grid grid-cols-12 gap-x-8 gap-y-12">
          <div className="col-span-12 lg:col-span-8">
            <ArticleCard article={first} size="lg" />
          </div>
          <div className="col-span-12 grid gap-x-8 gap-y-10 md:grid-cols-2 lg:col-span-12 lg:grid-cols-3">
            {rest.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-10 text-small text-text-3">Nothing published here yet.</p>
      )}
      <MonoLabel className="mt-16 block">
        Interviews live in{' '}
        <Link href="/interviews" className="underline underline-offset-4 hover:text-text">
          {brand.interviewSeries}
        </Link>
        .
      </MonoLabel>
    </PublicPage>
  );
}
