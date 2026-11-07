import { brand } from '@cmobeat/config';
import { MonoLabel } from '@cmobeat/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PublicPage } from '@/components/publication/PageHeader';
import { getViewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { Mdx } from '@/lib/mdx/render';
import { formatDate } from '@/lib/publication/labels';
import { getIssue } from '@/lib/publication/queries';

type Props = { params: Promise<{ id: string }> };

const load = cache(async (id: string) => {
  const viewer = await getViewer();
  return asViewer(viewer, (tx) => getIssue(tx, id));
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const issue = await load((await params).id);
  if (!issue) return { title: 'Not found', robots: { index: false } };
  return { title: issue.subject, alternates: { canonical: `/newsletter/archive/${issue.id}` } };
}

export default async function IssuePage({ params }: Props) {
  const issue = await load((await params).id);
  if (!issue) notFound();
  return (
    <PublicPage>
      <article aria-labelledby="issue-title" className="max-w-[68ch]">
        <MonoLabel>
          <Link href="/newsletter/archive" className="hover:text-text">
            {brand.newsletterName}
          </Link>
          {issue.sentAt ? ` · ${formatDate(issue.sentAt)}` : ''}
        </MonoLabel>
        <h1 id="issue-title" className="mt-4 font-serif text-h1 text-text">
          {issue.subject}
        </h1>
        <div className="mt-8">
          <Mdx source={issue.bodyMdx.replaceAll('{{unsubscribe_url}}', '/newsletter')} />
        </div>
      </article>
    </PublicPage>
  );
}
