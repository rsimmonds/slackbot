import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArticleView } from '@/components/publication/ArticleView';
import { loadArticle } from '@/lib/publication/loaders';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadArticle(slug, 'article');
  if (!data) return { title: 'Not found', robots: { index: false } };
  const { article } = data;
  return {
    title: article.title,
    description: article.dek ?? undefined,
    alternates: { canonical: `/articles/${article.slug}` },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.dek ?? undefined,
      url: `/articles/${article.slug}`,
      publishedTime: article.publishedAt.toISOString(),
      modifiedTime: article.updatedAt.toISOString(),
      authors: article.author ? [article.author] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const data = await loadArticle(slug, 'article');
  if (!data) notFound();
  return <ArticleView article={data.article} roles={data.roles} path={`/articles/${slug}`} />;
}
