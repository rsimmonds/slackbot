import { brand } from '@cmobeat/config';
import { MeshPanel, MonoLabel } from '@cmobeat/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NewsletterSignup } from '@/components/publication/NewsletterSignup';
import { PageHeader, PublicPage } from '@/components/publication/PageHeader';
import { consentText } from '@/lib/newsletter/service';

export const metadata: Metadata = {
  title: `Subscribe to ${brand.newsletterName}`,
  description: `${brand.newsletterName}: CMO moves, interviews and comp data, weekly. Reviewed by an editor before it is sent.`,
  alternates: { canonical: '/newsletter' },
};

const contents = [
  ['Moves', 'Every CMO appointment and departure we can source, approved by an editor.'],
  ['The Mandate', 'One long interview with a CMO, or the CEO who hired one.'],
  ['Comp', 'What the seat pays, by level and market, from listings that must show comp.'],
  ['Roles', 'A few senior roles worth your attention. Never more than five.'],
];

export default function NewsletterPage() {
  return (
    <PublicPage>
      <PageHeader
        eyebrow="Newsletter"
        title={`${brand.newsletterName}.`}
        lede="A weekly briefing for CMOs and the people who hire them. Short, sourced, and read by a human before it reaches you."
      />
      <div className="mt-12 grid grid-cols-12 gap-8">
        <section aria-labelledby="signup" className="col-span-12 lg:col-span-6">
          <MeshPanel>
            <h2 id="signup" className="mb-6 font-serif text-h3 text-text">
              Subscribe
            </h2>
            <NewsletterSignup consentText={consentText} variant="full" source="newsletter-page" />
          </MeshPanel>
          <p className="mt-6 text-micro text-text-3">
            Double opt-in: we email you a confirmation link first. Unsubscribe from any issue with
            one click. We never sell or share the list.
          </p>
        </section>
        <section
          aria-labelledby="whats-inside"
          className="col-span-12 lg:col-span-5 lg:col-start-8"
        >
          <h2 id="whats-inside" className="label-mono">
            In every issue
          </h2>
          <dl className="mt-4 flex flex-col divide-y divide-line border-y border-line">
            {contents.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[7rem_1fr] gap-4 py-4">
                <dt className="label-mono pt-0.5 text-text-2">{k}</dt>
                <dd className="text-small text-text-2">{v}</dd>
              </div>
            ))}
          </dl>
          <MonoLabel className="mt-6 block">
            <Link href="/newsletter/archive" className="hover:text-text">
              Read past issues →
            </Link>
          </MonoLabel>
        </section>
      </div>
    </PublicPage>
  );
}
