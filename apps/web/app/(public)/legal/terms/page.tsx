import { brand } from '@cmobeat/config';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Counsel, LegalPage, Section } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Terms',
  description: `The terms for using ${brand.name}.`,
  alternates: { canonical: '/legal/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      current="/legal/terms"
      updated="7 November 2026"
      lede="The rules for using the publication, the job board and the matching service, in plain language."
    >
      <Section title="Using the publication">
        <p>
          Read, quote briefly with a link, and share. Our data pages are published to be cited. Bulk
          copying of articles, moves or datasets needs a licence.{' '}
          <Counsel>data licensing terms for the intelligence API (Phase 4)</Counsel>
        </p>
      </Section>
      <Section title="Job posts">
        <ul>
          <li>Every listing must state a genuine compensation range and a real role.</li>
          <li>We review every post before it goes live and may decline or remove one.</li>
          <li>A post runs for 60 days. Fees are set out at checkout.</li>
        </ul>
        <p>
          <Counsel>
            refunds, taxes and pay-transparency obligations by market — LEGAL_REVIEW C2, C3
          </Counsel>
        </p>
      </Section>
      <Section title="Profiles and matching">
        <ul>
          <li>Profiles are private by default. You decide who sees yours.</li>
          <li>
            Matches are suggestions. A person approves each one before an employer sees it, and your
            identity is revealed only with your consent.
          </li>
          <li>
            Employers agree not to contact, screen or disclose candidates outside the platform
            before a consented reveal.
          </li>
        </ul>
        <p>
          <Counsel>search and fractional fee terms; agency licensing — LEGAL_REVIEW H4</Counsel>
        </p>
      </Section>
      <Section title="Accounts">
        <p>
          Keep your sign-in secure. Staff and employer admins must use multi-factor authentication.
          We may suspend accounts that misuse candidate data.
        </p>
      </Section>
      <Section title="Liability and law">
        <p>
          <Counsel>
            limitation of liability, governing law and venue, consumer carve-outs per market
          </Counsel>
        </p>
      </Section>
      <Section title="Privacy">
        <p>
          How we handle personal data is in the{' '}
          <Link href="/legal/privacy" className="underline underline-offset-4">
            Privacy
          </Link>{' '}
          notice.
        </p>
      </Section>
    </LegalPage>
  );
}
