import { brand } from '@cmobeat/config';
import type { Metadata } from 'next';
import { PageHeader, PublicPage } from '@/components/publication/PageHeader';
import { TokenButtonForm } from '@/components/publication/NewsletterForms';
import { unsubscribeAction } from '../actions';

export const metadata: Metadata = { title: 'Unsubscribe', robots: { index: false, follow: false } };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <PublicPage>
      <PageHeader eyebrow="Newsletter · Unsubscribe" title={`Leave ${brand.newsletterName}?`} />
      <div className="mt-10 max-w-xl">
        {token ? (
          <>
            <p className="mb-8 text-body text-text-2">
              You will stop receiving the newsletter straight away. Your mail client&apos;s own
              unsubscribe button works too.
            </p>
            <TokenButtonForm
              action={unsubscribeAction}
              token={token}
              label="Unsubscribe"
              doneHref="/"
              doneLabel="Back to the publication"
            />
          </>
        ) : (
          <p className="text-body text-text-2">
            This link is missing its code. Use the unsubscribe link at the foot of any issue.
          </p>
        )}
      </div>
    </PublicPage>
  );
}
