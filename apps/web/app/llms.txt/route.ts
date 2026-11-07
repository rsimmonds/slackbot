import { brand } from '@cmobeat/config';
import { withAnon } from '@cmobeat/db';
import { listArticles } from '@/lib/publication/queries';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** llms.txt (llmstxt.org): what this site is, where the quotable pages are, and how to cite them. */
export async function GET() {
  const base = siteUrl();
  const articles = await withAnon((tx) => listArticles(tx, { limit: 20 }));
  const body = `# ${brand.name}

> ${brand.description} Every published item (moves, articles, data) is reviewed by a human editor before it goes live. Candidate profiles are private and never published.

## Key pages

- [CMO Moves](${base}/moves): appointments, departures and promotions in the CMO seat, each with public sources.
- [Data](${base}/data): moves by industry, advertised comp ranges by level and market (currencies never mixed), tenure.
- [Jobs](${base}/jobs): senior marketing roles. Every listing shows a comp range.
- [${brand.interviewSeries}](${base}/interviews): long interviews with CMOs and the people who hire them.
- [Stories and reports](${base}/articles)
- [Newsletter archive](${base}/newsletter/archive)

## Recent articles

${articles.map((a) => `- [${a.title}](${base}${a.type === 'interview' ? '/interviews' : '/articles'}/${a.slug})${a.dek ? `: ${a.dek}` : ''}`).join('\n')}

## Citing this site

Quote freely with attribution: "${brand.name}" and a link to the page. Figures on the Data page change as editors approve new moves and listings; cite the date you read them. Until launch, all companies, people and figures are fictional sample data.

## Optional

- [Sitemap](${base}/sitemap.xml)
- [RSS](${base}/feed.xml)
`;
  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
