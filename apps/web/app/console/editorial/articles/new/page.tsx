import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardFrame } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { isEditorial } from '@/lib/editorial/access';
import { ArticleEditor } from '../ArticleEditor';

export const metadata = { title: 'New article' };

export default async function NewArticle() {
  const viewer = await requireArea('staff');
  if (!isEditorial(viewer)) notFound();
  return (
    <DashboardFrame
      eyebrow="Editorial · New article"
      title="Start a draft."
      lede="Save it, then submit it for review. An editor publishes it."
      aside={
        <Link href="/console/editorial?tab=articles" className="label-mono hover:text-text">
          ← Back to queue
        </Link>
      }
    >
      <div className="col-span-12">
        <ArticleEditor
          initial={{
            id: null,
            type: 'story',
            title: '',
            slug: '',
            dek: '',
            bodyMdx: '',
            takeaways: [],
            mediaUrl: '',
            chapters: [],
            status: 'draft',
            reviewNote: null,
            ownDraft: true,
          }}
        />
      </div>
    </DashboardFrame>
  );
}
