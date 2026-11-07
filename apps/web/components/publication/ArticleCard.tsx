import { MonoLabel } from '@cmobeat/ui';
import Link from 'next/link';
import { formatDate } from '@/lib/publication/labels';
import type { ArticleCard as Card } from '@/lib/publication/queries';

const typeLabel = { story: 'Story', interview: 'The Mandate', report: 'Report' } as const;

export const articleHref = (a: Pick<Card, 'type' | 'slug'>) =>
  a.type === 'interview' ? `/interviews/${a.slug}` : `/articles/${a.slug}`;

/** Editorial list item: mono kicker, serif headline, dek, date and reading time. */
export function ArticleCard({ article, size = 'md' }: { article: Card; size?: 'lg' | 'md' }) {
  const minutes = Math.max(1, Math.round(article.words / 230));
  return (
    <article className="group flex flex-col gap-3 border-t border-line pt-5">
      <MonoLabel>
        {typeLabel[article.type]} · {formatDate(article.publishedAt, 'short')} · {minutes} min
      </MonoLabel>
      <h3
        className={size === 'lg' ? 'font-serif text-h2 text-text' : 'font-serif text-h3 text-text'}
      >
        <Link
          href={articleHref(article)}
          className="decoration-line-strong underline-offset-4 group-hover:underline"
        >
          {article.title}
        </Link>
      </h3>
      {article.dek ? <p className="max-w-prose text-small text-text-2">{article.dek}</p> : null}
    </article>
  );
}
