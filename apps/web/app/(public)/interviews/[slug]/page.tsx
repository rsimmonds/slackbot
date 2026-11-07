import { brand } from '@cmobeat/config';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArticleView } from '@/components/publication/ArticleView';
import { loadArticle } from '@/lib/publication/loaders';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadArticle(slug, 'interview');
  if (!data) return { title: 'Not found', robots: { index: false } };
  const { article } = data;
  return {
    title: `${article.title} · ${brand.interviewSeries}`,
    description: article.dek ?? undefined,
    alternates: { canonical: `/interviews/${article.slug}` },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.dek ?? undefined,
      url: `/interviews/${article.slug}`,
      publishedTime: article.publishedAt.toISOString(),
    },
  };
}

export default async function InterviewPage({ params }: Props) {
  const { slug } = await params;
  const data = await loadArticle(slug, 'interview');
  if (!data) notFound();
  return <ArticleView article={data.article} roles={data.roles} path={`/interviews/${slug}`} />;
}
