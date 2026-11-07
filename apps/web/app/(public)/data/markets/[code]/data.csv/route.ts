import { datasetCsv, marketDataset } from '@/lib/publication/datasets';

export const dynamic = 'force-dynamic';

/** GET /data/markets/[code]/data.csv — the aggregates shown on the page. No personal data. */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const d = code === code.toLowerCase() ? await marketDataset(code) : null;
  if (!d) return new Response('Not found', { status: 404 });
  return new Response(datasetCsv(d), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="cmobeat-market-${d.key}.csv"`,
      'cache-control': 'public, max-age=3600',
    },
  });
}
