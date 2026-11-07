import type { Metadata } from 'next';
import { CookieSettings } from '@/components/legal/CookieSettings';
import { LegalPage, Section } from '@/components/legal/LegalPage';
import { getConsent } from '@/lib/consent/server';

export const metadata: Metadata = {
  title: 'Cookies',
  description: 'The cookies we use and your choices.',
  alternates: { canonical: '/legal/cookies' },
};

export const dynamic = 'force-dynamic';

const cookies = [
  {
    name: 'cmob_session',
    purpose: 'Keeps you signed in.',
    kind: 'Strictly necessary',
    lasts: '12 hours (staff) or 7 days',
  },
  {
    name: 'cmob_theme',
    purpose: 'Remembers Lab or Retreat.',
    kind: 'Strictly necessary',
    lasts: '1 year',
  },
  {
    name: 'cmob_consent',
    purpose: 'Remembers this choice.',
    kind: 'Strictly necessary',
    lasts: '6 months',
  },
  {
    name: '__session, __client (Clerk)',
    purpose: 'Sign-in, once Clerk is connected.',
    kind: 'Strictly necessary',
    lasts: 'Session',
  },
  {
    name: 'Analytics (PostHog)',
    purpose: 'Which pages are read. Not active yet.',
    kind: 'Optional',
    lasts: 'Up to 1 year',
  },
];

export default async function CookiesPage() {
  const consent = await getConsent();
  return (
    <LegalPage
      title="Cookies"
      current="/legal/cookies"
      updated="7 November 2026"
      lede="We use only the cookies the site needs. Analytics is optional, off until you say yes, and you can change your mind here."
    >
      <Section title="Your choice">
        <CookieSettings consent={consent} />
      </Section>
      <Section title="What we set">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Cookies we set">
          <table className="w-full min-w-[560px] border-collapse text-left text-small">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="label-mono py-2 pr-4 font-normal">
                  Cookie
                </th>
                <th scope="col" className="label-mono py-2 pr-4 font-normal">
                  Purpose
                </th>
                <th scope="col" className="label-mono py-2 pr-4 font-normal">
                  Type
                </th>
                <th scope="col" className="label-mono py-2 font-normal">
                  Lasts
                </th>
              </tr>
            </thead>
            <tbody>
              {cookies.map((c) => (
                <tr key={c.name} className="border-b border-line align-top">
                  <th scope="row" className="numeric py-3 pr-4 font-normal text-text">
                    {c.name}
                  </th>
                  <td className="py-3 pr-4">{c.purpose}</td>
                  <td className="py-3 pr-4">{c.kind}</td>
                  <td className="py-3">{c.lasts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          No advertising cookies. No third-party tracking pixels, including in sponsored placements.
        </p>
      </Section>
      <Section title="Global Privacy Control">
        <p>
          If your browser sends Global Privacy Control, we treat it as a no to analytics and
          don&apos;t ask.
        </p>
      </Section>
    </LegalPage>
  );
}
