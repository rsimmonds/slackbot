import { brand } from '@cmobeat/config';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader, PublicPage } from '@/components/publication/PageHeader';
import { TokenButtonForm } from '@/components/publication/NewsletterForms';
import { confirmAction } from '../actions';

export const metadata: Metadata = {
  title: 'Confirm your subscription',
  robots: { index: false, follow: false },
};

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <PublicPage>
      <PageHeader eyebrow="Newsletter · Confirm" title="One step left." />
      <div className="mt-10 max-w-xl">
        {token ? (
          <>
            <p className="mb-8 text-body text-text-2">
              Confirm that you want {brand.newsletterName}. We ask you to press the button, rather
              than confirming when the link opens, so no one can subscribe you by accident.
            </p>
            <TokenButtonForm
              action={confirmAction}
              token={token}
              label="Confirm subscription"
              human
              doneHref="/"
              doneLabel="Back to the publication"
            />
          </>
        ) : (
          <p className="text-body text-text-2">
            This link is missing its code. Use the link in your email, or{' '}
            <Link href="/newsletter" className="text-text underline underline-offset-4">
              subscribe again
            </Link>
            .
          </p>
        )}
      </div>
    </PublicPage>
  );
}
