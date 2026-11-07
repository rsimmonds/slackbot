import { MeshPanel, MonoLabel } from '@cmobeat/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader, PublicPage } from '@/components/publication/PageHeader';
import { PreferencesForm } from '@/components/publication/NewsletterForms';
import { getSubscription, maskEmail } from '@/lib/newsletter/service';
import { preferencesAction } from '../actions';

export const metadata: Metadata = {
  title: 'Email preferences',
  robots: { index: false, follow: false },
};

export default async function PreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const sub = token ? await getSubscription(token) : null;
  return (
    <PublicPage>
      <PageHeader eyebrow="Newsletter · Preferences" title="Your email preferences." />
      <div className="mt-10 max-w-xl">
        {sub && token ? (
          <MeshPanel>
            <MonoLabel>{maskEmail(sub.email)}</MonoLabel>
            {sub.status === 'unsubscribed' ? (
              <p className="mt-4 text-body text-text-2">
                This address is unsubscribed.{' '}
                <Link href="/newsletter" className="text-text underline underline-offset-4">
                  Subscribe again
                </Link>
                .
              </p>
            ) : (
              <div className="mt-6">
                <PreferencesForm
                  action={preferencesAction}
                  token={token}
                  initial={sub.preferences}
                />
                <p className="mt-8 border-t border-line pt-4 text-small text-text-3">
                  Want nothing at all?{' '}
                  <Link
                    href={`/newsletter/unsubscribe?token=${encodeURIComponent(token)}`}
                    className="text-text-2 underline underline-offset-4"
                  >
                    Unsubscribe
                  </Link>
                  .
                </p>
              </div>
            )}
          </MeshPanel>
        ) : (
          <p className="text-body text-text-2">
            This link is not valid. Use the preferences link at the foot of any issue.
          </p>
        )}
      </div>
    </PublicPage>
  );
}
