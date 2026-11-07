import 'server-only';
import { cache } from 'react';
import { getViewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { getArticle, getMove, liveRoles, type ArticleType } from './queries';

/** Per-request cached loaders, so generateMetadata and the page share one query. */
const kindTypes: Record<'article' | 'interview', ArticleType[]> = {
  article: ['story', 'report'],
  interview: ['interview'],
};

export const loadArticle = cache(async (slug: string, kind: 'article' | 'interview') => {
  const types = kindTypes[kind];
  const viewer = await getViewer();
  return asViewer(viewer, async (tx) => {
    const article = await getArticle(tx, slug, types);
    const roles = article ? await liveRoles(tx, { limit: 3 }) : [];
    return article ? { article, roles } : null;
  });
});

export const loadMove = cache(async (id: string) => {
  const viewer = await getViewer();
  return asViewer(viewer, (tx) => getMove(tx, id));
});
