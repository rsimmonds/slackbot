import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DatasetView } from '@/components/publication/DatasetView';
import { industryDataset } from '@/lib/publication/datasets';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const d = await industryDataset((await params).slug);
  if (!d) return { title: 'Data' };
  return {
    title: `${d.name}: CMO moves and comp`,
    description: `Editor-approved CMO moves and advertised comp in ${d.name}. Aggregates with a CSV and a citation.`,
    alternates: { canonical: d.path },
  };
}

export default async function IndustryDataPage({ params }: Params) {
  const d = await industryDataset((await params).slug);
  if (!d) notFound();
  return <DatasetView d={d} origin={siteUrl()} />;
}
