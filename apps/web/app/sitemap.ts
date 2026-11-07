import { withAnon } from '@cmobeat/db';
import type { MetadataRoute } from 'next';
import { publicIndustries, publicMarkets } from '@/lib/publication/aggregates';
import { sitemapEntries } from '@/lib/publication/queries';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** Public pages only, read as an anonymous visitor so nothing private can leak in. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [{ articles, moves }, industries] = await withAnon((tx) =>
    Promise.all([sitemapEntries(tx), publicIndustries(tx)]),
  );
  const staticPages = [
    '',
    '/jobs',
    '/moves',
    '/articles',
    '/interviews',
    '/data',
    '/data/report',
    ...publicMarkets.map((m) => `/data/markets/${m.toLowerCase()}`),
    ...industries.map((i) => `/data/industries/${i.slug}`),
    '/newsletter',
    '/newsletter/archive',
    '/legal/privacy',
    '/legal/terms',
    '/legal/cookies',
    '/legal/subprocessors',
    '/legal/ai',
  ];
  return [
    ...staticPages.map((p) => ({
      url: `${base}${p}`,
      changeFrequency: 'daily' as const,
      priority: p === '' ? 1 : 0.8,
    })),
    ...articles.map((a) => ({
      url: `${base}${a.type === 'interview' ? '/interviews' : '/articles'}/${a.slug}`,
      lastModified: a.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...moves.map((m) => ({
      url: `${base}/moves/${m.id}`,
      lastModified: m.updatedAt,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    })),
  ];
}
