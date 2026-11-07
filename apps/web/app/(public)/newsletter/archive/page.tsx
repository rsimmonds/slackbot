import { brand } from '@cmobeat/config';
import { MonoLabel } from '@cmobeat/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader, PublicPage } from '@/components/publication/PageHeader';
import { getViewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { formatDate } from '@/lib/publication/labels';
import { sentIssues } from '@/lib/publication/queries';

export const metadata: Metadata = {
  title: `${brand.newsletterName} archive`,
  description: `Every issue of ${brand.newsletterName} that has been sent.`,
  alternates: { canonical: '/newsletter/archive' },
};

export default async function ArchivePage() {
  const viewer = await getViewer();
  const issues = await asViewer(viewer, (tx) => sentIssues(tx));
  return (
    <PublicPage>
      <PageHeader
        eyebrow="Newsletter · Archive"
        title="Past issues."
        aside={
          <Link href="/newsletter" className="label-mono hover:text-text">
            Subscribe →
          </Link>
        }
      />
      {issues.length ? (
        <ol className="mt-10 flex max-w-3xl flex-col divide-y divide-line border-y border-line">
          {issues.map((i) => (
            <li key={i.id} className="grid grid-cols-[8rem_1fr] gap-6 py-5">
              <MonoLabel>{i.sentAt ? formatDate(i.sentAt, 'short') : ''}</MonoLabel>
              <Link
                href={`/newsletter/archive/${i.id}`}
                className="font-serif text-h4 text-text underline-offset-4 hover:underline"
              >
                {i.subject}
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-10 max-w-xl text-body text-text-2">
          The first issue has not been sent yet. Subscribe and it will arrive in your inbox before
          it appears here.
        </p>
      )}
    </PublicPage>
  );
}
