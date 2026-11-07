import { Status } from '@cmobeat/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardFrame } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { isEditorial } from '@/lib/editorial/access';
import { getEditableArticle } from '@/lib/editorial/articles';
import { articleStatusLabel } from '@/lib/editorial/format';
import { ArticleEditor } from '../ArticleEditor';

export const metadata = { title: 'Edit article' };

export default async function EditArticle({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const viewer = await requireArea('staff');
  if (!isEditorial(viewer)) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const a = await getEditableArticle(viewer, id);
  if (!a) notFound();
  const { saved } = await searchParams;
  const media = a.media as { url?: string } | null;

  return (
    <DashboardFrame
      eyebrow={`Editorial · ${articleStatusLabel[a.status]}`}
      title={a.title}
      lede={
        a.status === 'in_review'
          ? 'Waiting for an editor. Read it as a reader would, then publish or return it with a note.'
          : a.status === 'published'
            ? 'Published. Corrections arrive in a later phase.'
            : 'Draft. Only staff can see it.'
      }
      aside={
        <Link href="/console/editorial?tab=articles" className="label-mono hover:text-text">
          ← Back to queue
        </Link>
      }
    >
      {saved ? (
        <p role="status" className="col-span-12">
          <Status tone="good">Draft saved.</Status>
        </p>
      ) : null}
      {a.status === 'rejected' && a.reviewNote ? (
        <p className="col-span-12 rounded-control border border-critical/40 p-4 text-small text-text-2">
          <span className="label-mono text-critical-ink">Returned</span> · {a.reviewNote}
        </p>
      ) : null}
      <div className="col-span-12">
        <ArticleEditor
          key={`${a.id}-${a.status}`}
          initial={{
            id: a.id,
            type: a.type,
            title: a.title,
            slug: a.slug,
            dek: a.dek ?? '',
            bodyMdx: a.bodyMdx,
            takeaways: a.takeaways,
            mediaUrl: media?.url ?? '',
            chapters: a.chapters ?? [],
            status: a.status,
            reviewNote: a.reviewNote,
            ownDraft: a.authorId === viewer.id,
          }}
        />
      </div>
    </DashboardFrame>
  );
}
