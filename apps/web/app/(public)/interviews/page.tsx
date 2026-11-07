import { brand } from '@cmobeat/config';
import type { Metadata } from 'next';
import { ArticleCard } from '@/components/publication/ArticleCard';
import { PageHeader, PublicPage } from '@/components/publication/PageHeader';
import { getViewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { listArticles } from '@/lib/publication/queries';

export const metadata: Metadata = {
  title: brand.interviewSeries,
  description: `${brand.interviewSeries}: long interviews with CMOs and the people who hire them.`,
  alternates: { canonical: '/interviews' },
};

export default async function InterviewsIndex() {
  const viewer = await getViewer();
  const interviews = await asViewer(viewer, (tx) =>
    listArticles(tx, { types: ['interview'], limit: 48 }),
  );
  return (
    <PublicPage>
      <PageHeader
        eyebrow="Interview series"
        title={brand.interviewSeries}
        lede="CMOs and the CEOs who hire them, on what the job was really for. Each interview has chapters, a full transcript and key takeaways."
      />
      {interviews.length ? (
        <div className="mt-10 grid gap-x-8 gap-y-12 md:grid-cols-2">
          {interviews.map((a, i) => (
            <ArticleCard key={a.id} article={a} size={i === 0 ? 'lg' : 'md'} />
          ))}
        </div>
      ) : (
        <p className="mt-10 text-small text-text-3">The first interview is with the editors.</p>
      )}
    </PublicPage>
  );
}
