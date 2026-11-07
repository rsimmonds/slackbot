import { brand } from '@cmobeat/config';
import { HumanSeal, MonoLabel } from '@cmobeat/ui';
import Link from 'next/link';
import { Mdx } from '@/lib/mdx/render';
import { formatDate, readingMinutes } from '@/lib/publication/labels';
import type { ArticleDetail, RoleCard as Role } from '@/lib/publication/queries';
import { InterviewMedia } from './InterviewMedia';
import { JsonLd } from './JsonLd';
import { ReadingProgress } from './ReadingProgress';
import { RoleCard } from './RoleCard';
import { SponsorSlot } from '../sponsorships/SponsorSlot';

const kicker = { story: 'Story', interview: brand.interviewSeries, report: 'Report' } as const;

/**
 * Long-form template shared by stories, reports and interviews: serif headline, reading progress,
 * MDX body, bylines with the editor's human-review seal, takeaways, related roles.
 */
export function ArticleView({
  article,
  roles,
  path,
}: {
  article: ArticleDetail;
  roles: Role[];
  path: string;
}) {
  const url = `https://${brand.domain}${path}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': article.type === 'report' ? 'Report' : 'Article',
    headline: article.title,
    description: article.dek ?? undefined,
    datePublished: article.publishedAt.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    mainEntityOfPage: url,
    url,
    wordCount: article.words,
    author: article.author ? { '@type': 'Person', name: article.author } : undefined,
    editor: article.editor ? { '@type': 'Person', name: article.editor } : undefined,
    publisher: { '@type': 'Organization', name: brand.name, url: `https://${brand.domain}` },
    isAccessibleForFree: true,
  };

  return (
    <main className="relative mx-auto max-w-[1280px] px-4 pt-12 pb-24 md:px-8 md:pt-16">
      <JsonLd data={jsonLd} />
      <article aria-labelledby="article-title">
        <header className="grid grid-cols-12 gap-6 pb-10">
          <div className="col-span-12 flex flex-col gap-5 lg:col-span-9">
            <MonoLabel>
              <Link
                href={article.type === 'interview' ? '/interviews' : '/articles'}
                className="hover:text-text"
              >
                {kicker[article.type]}
              </Link>{' '}
              · {formatDate(article.publishedAt)} · {readingMinutes(article.bodyMdx)} min read
            </MonoLabel>
            <h1 id="article-title" className="font-serif text-h1 text-text md:text-display">
              {article.title}
            </h1>
            {article.dek ? (
              <p className="max-w-2xl text-h4 font-normal text-text-2">{article.dek}</p>
            ) : null}
          </div>
        </header>
        <ReadingProgress targetId="article-body" />

        <div className="mt-10 grid grid-cols-12 gap-8">
          <aside className="order-2 col-span-12 flex flex-col gap-8 lg:order-1 lg:col-span-3">
            <dl className="flex flex-col gap-4 border-t border-line pt-4">
              {article.author ? (
                <div className="flex flex-col gap-1">
                  <dt className="label-mono">
                    {article.type === 'interview' ? 'Interview by' : 'Written by'}
                  </dt>
                  <dd className="text-small text-text">{article.author}</dd>
                </div>
              ) : null}
              {article.editor ? (
                <div className="flex flex-col gap-2">
                  <dt className="label-mono">Edited by</dt>
                  <dd>
                    <HumanSeal
                      reviewer={article.editor}
                      at={article.publishedAt}
                      label="Editor reviewed"
                    />
                  </dd>
                </div>
              ) : null}
            </dl>
            {article.takeaways.length ? (
              <section aria-labelledby="takeaways" className="border-t border-line pt-4">
                <h2 id="takeaways" className="label-mono">
                  Key takeaways
                </h2>
                <ul className="mt-3 flex flex-col gap-3 text-small text-text-2">
                  {article.takeaways.map((t) => (
                    <li key={t} className="flex gap-3">
                      <span aria-hidden className="mt-[0.7em] h-px w-3 shrink-0 bg-text-3" />
                      {t}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>

          <div
            id="article-body"
            className="order-1 col-span-12 lg:order-2 lg:col-span-7 lg:col-start-5"
          >
            {article.type === 'interview' ? (
              <div className="mb-10">
                <InterviewMedia
                  media={article.media}
                  chapters={article.chapters}
                  title={article.title}
                />
              </div>
            ) : null}
            {article.type === 'interview' ? <h2 className="label-mono mb-2">Transcript</h2> : null}
            <div className="max-w-[68ch]">
              <Mdx source={article.bodyMdx} />
            </div>
          </div>
        </div>
      </article>

      <SponsorSlot placement="article_foot" className="mt-24 max-w-[68ch]" />

      {roles.length ? (
        <section aria-labelledby="related-roles" className="mt-24 border-t border-line pt-10">
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 id="related-roles" className="font-serif text-h3 text-text">
              Roles open now
            </h2>
            <Link href="/jobs" className="label-mono hover:text-text">
              All jobs →
            </Link>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {roles.map((r) => (
              <RoleCard key={r.id} role={r} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
