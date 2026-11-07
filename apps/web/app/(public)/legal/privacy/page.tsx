import { brand } from '@cmobeat/config';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Counsel, LegalPage, Section } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy',
  description: `How ${brand.name} collects, uses and protects personal data.`,
  alternates: { canonical: '/legal/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      current="/legal/privacy"
      updated="7 November 2026"
      lede={`Sitting executives trust ${brand.name} with things their employers don't know yet. This page says what we collect, why, who else touches it, and how to take it back.`}
    >
      <Section title="The short version">
        <ul>
          <li>Your candidate profile is visible to no one until you change that.</li>
          <li>We never sell personal data, and we don't run advertising trackers.</li>
          <li>
            A person approves every match before an employer sees it, and your identity is revealed
            only with your explicit consent.
          </li>
          <li>You can export or permanently delete your data yourself, at any time.</li>
        </ul>
      </Section>

      <Section title="Who we are">
        <p>
          {brand.name} is the controller of the personal data described here.{' '}
          <Counsel>
            legal entity name, registered address, and EU and UK representatives (GDPR Art. 27)
          </Counsel>
        </p>
      </Section>

      <Section title="What we collect">
        <ul>
          <li>
            <strong>Readers:</strong> email address, newsletter preferences and market, and the
            exact consent wording you agreed to.
          </li>
          <li>
            <strong>Candidates:</strong> profile answers, outcomes you approve, your ideal next
            role, uploaded résumé or LinkedIn PDF, comp floor and contact details. Résumés, contact
            details and comp are encrypted before they are stored.
          </li>
          <li>
            <strong>Employers:</strong> your name and work email, your company, job descriptions,
            mandates and billing contacts.
          </li>
          <li>
            <strong>Everyone:</strong> sign-in records, security logs, and an audit log of every
            access to candidate data and every hiring decision.
          </li>
          <li>
            <strong>Public sources:</strong> CMO appointments and departures reported in company
            newsrooms, press wires and SEC filings, with the source cited.
          </li>
        </ul>
        <p>
          We never ask for age, gender, pronouns, nationality, photos or graduation years, and we
          remove them before matching if you include them.
        </p>
      </Section>

      <Section title="Why we use it">
        <ul>
          <li>
            To run your account and the services you ask for (publication, job board, profiles,
            matching).
          </li>
          <li>To send the newsletter and alerts you opted in to.</li>
          <li>
            To keep the platform secure and to keep the records the law requires for AI-assisted
            hiring.
          </li>
          <li>To measure which pages are read, only if you accept analytics.</li>
        </ul>
        <p>
          <Counsel>
            confirm the lawful basis per purpose (contract, consent, legitimate interests, legal
            obligation) — LEGAL_REVIEW P2
          </Counsel>
        </p>
      </Section>

      <Section title="AI">
        <p>
          AI helps us parse job descriptions, draft CMO moves, run interviews and suggest matches.
          It never makes the decision. See{' '}
          <Link href="/legal/ai" className="underline underline-offset-4">
            How we use AI
          </Link>
          .
        </p>
      </Section>

      <Section title="Who else processes it">
        <p>
          A short list of providers process data for us under contract. See{' '}
          <Link href="/legal/subprocessors" className="underline underline-offset-4">
            Subprocessors
          </Link>
          . We send each one the minimum it needs.
        </p>
      </Section>

      <Section title="International transfers">
        <p>
          Most of our providers are in the United States. When we transfer personal data from the
          EU, UK or Canada we use the safeguards the law requires.{' '}
          <Counsel>
            SCCs / UK IDTA, and whether EU candidate data must stay in the EU — LEGAL_REVIEW P1
          </Counsel>
        </p>
      </Section>

      <Section title="How long we keep it">
        <ul>
          <li>Inactive candidate profiles are anonymized after 24 months.</li>
          <li>Deletion requests are completed within 30 days.</li>
          <li>
            Audit records of hiring decisions are kept as long as the law requires, without the
            personal data they refer to once that data is deleted.
          </li>
        </ul>
        <p>
          <Counsel>retention periods per market — LEGAL_REVIEW P5</Counsel>
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Wherever you live, you can access, correct, export or delete your data, withdraw consent,
          and object to processing. Residents of the EU and UK (GDPR), California (CCPA/CPRA) and
          Canada (PIPEDA, and Québec Law 25) have these rights in law; we give them to everyone.
        </p>
        <ul>
          <li>
            Export or delete your data:{' '}
            <Link href="/account/data" className="underline underline-offset-4">
              Account → Your data
            </Link>
            .
          </li>
          <li>
            Ask for a person to review any AI-assisted decision about you, or opt out of matching:
            see{' '}
            <Link href="/legal/ai" className="underline underline-offset-4">
              How we use AI
            </Link>
            .
          </li>
          <li>
            Cookie choices:{' '}
            <Link href="/legal/cookies" className="underline underline-offset-4">
              Cookie settings
            </Link>
            .
          </li>
          <li>We honour Global Privacy Control as an opt-out.</li>
        </ul>
        <p>
          You can also complain to your data-protection authority.{' '}
          <Counsel>privacy contact address and DPO, if appointed</Counsel>
        </p>
      </Section>
    </LegalPage>
  );
}
