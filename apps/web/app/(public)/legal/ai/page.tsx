import { brand } from '@cmobeat/config';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Counsel, LegalPage, Section } from '@/components/legal/LegalPage';
import { agentNotices } from '@/lib/legal/agents';

export const metadata: Metadata = {
  title: 'How we use AI',
  description: `What AI does at ${brand.name}, what it sees, and how people stay in charge.`,
  alternates: { canonical: '/legal/ai' },
};

export default function AiNoticePage() {
  return (
    <LegalPage
      title="How we use AI"
      current="/legal/ai"
      updated="7 November 2026"
      lede="AI drafts, parses and suggests. People decide. Nothing an AI produces reaches a reader, an employer or a candidate until a person has approved it."
    >
      <Section title="Three rules">
        <ul>
          <li>
            <strong>A person approves every match</strong> before an employer sees it.
          </li>
          <li>
            <strong>An editor approves everything we publish.</strong>
          </li>
          <li>
            <strong>No one learns who a candidate is</strong> without that candidate’s explicit
            consent.
          </li>
        </ul>
      </Section>

      <Section title="Each AI agent">
        <ul className="!ml-0 flex flex-col divide-y divide-line border-y border-line [&>li]:!ml-0 [&>li]:list-none">
          {agentNotices.map((a) => (
            <li key={a.name} className="flex flex-col gap-2 py-5">
              <h3 className="text-h4 font-medium text-text">{a.name}</h3>
              <p className="text-small">{a.what}</p>
              <p className="text-small">
                <span className="text-text">What it sees: </span>
                {a.receives}
              </p>
              <p className="text-small">
                <span className="text-text">Who checks it: </span>
                {a.humanCheck}
              </p>
            </li>
          ))}
        </ul>
        <p>
          The models are provided by Anthropic. Their role is listed with our other{' '}
          <Link href="/legal/subprocessors" className="underline underline-offset-4">
            subprocessors
          </Link>
          .
        </p>
      </Section>

      <Section title="Fairness and audits">
        <p>
          Matching never uses protected attributes. We test it by comparing match rates for profiles
          that differ only in those attributes, and we keep the inputs, outputs and decisions needed
          for an independent bias audit under New York City Local Law 144 and the EU AI Act’s rules
          for AI used in hiring.
        </p>
        <p>
          <Counsel>
            audit scope and publication of results; EU AI Act provider/deployer duties —
            LEGAL_REVIEW H1, H2
          </Counsel>
        </p>
      </Section>

      <Section title="Your choices">
        <ul>
          <li>
            <strong>Opt out of matching:</strong> set your profile to Hidden. Hidden profiles are
            never matched and are visible to no one but you.
          </li>
          <li>
            <strong>Ask for a human review</strong> of any AI-assisted suggestion or decision about
            you: decline or ask a question on the match, or write to us. A talent partner will
            review it and reply. <Counsel>review contact address and response time</Counsel>
          </li>
          <li>
            <strong>See or delete your data:</strong>{' '}
            <Link href="/account/data" className="underline underline-offset-4">
              Account → Your data
            </Link>
            .
          </li>
        </ul>
      </Section>
    </LegalPage>
  );
}
