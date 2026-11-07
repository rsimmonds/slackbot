import { brand } from '@cmobeat/config';
import { emailConfig } from '../config';
import type { OutgoingEmail } from '../index';
import { renderEmail } from '../render';
import { EmailButton, EmailHeading, EmailLayout, EmailText } from './Layout';

/**
 * Matching notifications. None of them carry message content, company names before a reveal,
 * or a candidate's identity. They point back to the signed-in page, where access rules apply.
 */

async function build(opts: {
  to: string;
  subject: string;
  template: string;
  eyebrow: string;
  reason: string;
  heading: string;
  body: string;
  cta: string;
  path: string;
  human?: boolean;
}): Promise<OutgoingEmail> {
  const c = emailConfig();
  const url = `${c.siteUrl}${opts.path}`;
  const { html, text } = await renderEmail(
    <EmailLayout
      preview={opts.heading}
      eyebrow={opts.eyebrow}
      reason={opts.reason}
      postalAddress={c.postalAddress}
      siteUrl={c.siteUrl}
    >
      <EmailHeading>{opts.heading}</EmailHeading>
      <EmailText muted>{opts.body}</EmailText>
      <EmailButton href={url} human={opts.human}>
        {opts.cta}
      </EmailButton>
    </EmailLayout>,
  );
  return {
    to: opts.to,
    subject: opts.subject,
    template: opts.template,
    html,
    text,
    payload: { path: opts.path },
  };
}

const candidateReason = `You're receiving this because your ${brand.name} profile is open to matching. You can change who sees it at any time.`;

/** To a candidate: a person approved a match for them. */
export const matchApprovedEmail = (to: string) =>
  build({
    to,
    subject: 'A role was matched to your profile',
    template: 'match-approved',
    eyebrow: 'Matches',
    reason: candidateReason,
    heading: 'A person reviewed a match for you.',
    body: 'Our talent partners think a role fits your outcomes. The company has not seen who you are, and won’t unless you choose to reveal yourself.',
    cta: 'See the match',
    path: '/me/matches',
  });

/** To a candidate: an employer asked to be introduced. No company name in the email. */
export const introductionRequestedEmail = (to: string) =>
  build({
    to,
    subject: 'A company has asked to be introduced',
    template: 'match-introduction-requested',
    eyebrow: 'Matches · Introduction',
    reason: candidateReason,
    heading: 'A company has asked to be introduced.',
    body: 'They have seen an anonymised summary of your outcomes, approved by a person. Your name and contact details stay private unless you consent.',
    cta: 'Review the request',
    path: '/me/matches',
    human: true,
  });

/** To the employer who asked: the candidate's decision. */
export const revealDecisionEmail = (to: string, accepted: boolean, mandateId: string) =>
  build({
    to,
    subject: accepted ? 'A candidate agreed to an introduction' : 'An introduction was declined',
    template: accepted ? 'match-reveal-accepted' : 'match-reveal-declined',
    eyebrow: 'Shortlist',
    reason: `You're receiving this because you requested an introduction on ${brand.name}.`,
    heading: accepted ? 'They agreed to be introduced.' : 'They chose not to be introduced.',
    body: accepted
      ? 'Their name and contact details are now on your shortlist. You can message them there.'
      : 'Their profile stays anonymous. Nothing else changes on your shortlist.',
    cta: 'Open the shortlist',
    path: `/employer/mandates/${mandateId}/shortlist`,
  });

/** To the other participant in a revealed match: a new message. Never includes the content. */
export const newMessageEmail = (to: string, path: string) =>
  build({
    to,
    subject: 'You have a new message',
    template: 'match-message',
    eyebrow: 'Messages',
    reason: `You're receiving this because you are part of an introduction on ${brand.name}.`,
    heading: 'You have a new message.',
    body: 'For privacy, messages are only shown after you sign in.',
    cta: 'Read the message',
    path,
  });
