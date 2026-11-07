import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DatasetView } from '@/components/publication/DatasetView';
import { marketDataset } from '@/lib/publication/datasets';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const d = await marketDataset((await params).code);
  if (!d) return { title: 'Data' };
  return {
    title: `${d.name}: CMO moves and comp`,
    description: `Editor-approved CMO moves and advertised comp in ${d.name}. Aggregates with a CSV and a citation.`,
    alternates: { canonical: d.path },
  };
}

export default async function MarketDataPage({ params }: Params) {
  const { code } = await params;
  if (code !== code.toLowerCase()) notFound();
  const d = await marketDataset(code);
  if (!d) notFound();
  return <DatasetView d={d} origin={siteUrl()} />;
}
