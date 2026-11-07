import { datasetCsv, industryDataset } from '@/lib/publication/datasets';

export const dynamic = 'force-dynamic';

/** GET /data/industries/[slug]/data.csv — the aggregates shown on the page. No personal data. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const d = await industryDataset(slug);
  if (!d) return new Response('Not found', { status: 404 });
  return new Response(datasetCsv(d), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="cmobeat-${d.key}.csv"`,
      'cache-control': 'public, max-age=3600',
    },
  });
}
