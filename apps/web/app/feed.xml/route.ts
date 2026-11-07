import { brand } from '@cmobeat/config';
import { withAnon } from '@cmobeat/db';
import { listArticles } from '@/lib/publication/queries';
import { escapeXml, siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** RSS 2.0 feed of published stories, reports and interviews. */
export async function GET() {
  const base = siteUrl();
  const articles = await withAnon((tx) => listArticles(tx, { limit: 30 }));
  const items = articles
    .map((a) => {
      const url = `${base}${a.type === 'interview' ? '/interviews' : '/articles'}/${a.slug}`;
      return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${a.publishedAt.toUTCString()}</pubDate>${a.dek ? `\n      <description>${escapeXml(a.dek)}</description>` : ''}
    </item>`;
    })
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(brand.name)}</title>
    <link>${base}</link>
    <description>${escapeXml(brand.description)}</description>
    <language>en</language>
    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
  return new Response(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=900',
    },
  });
}
