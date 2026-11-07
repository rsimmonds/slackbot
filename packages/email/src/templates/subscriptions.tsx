import { brand } from '@cmobeat/config';
import { emailConfig } from '../config';
import type { OutgoingEmail } from '../index';
import { renderEmail } from '../render';
import { EmailButton, EmailHeading, EmailLayout, EmailRule, EmailText } from './Layout';

/**
 * Subscription, seat, concierge and career-digest emails. They link back to signed-in pages; none
 * carries payment details, candidate data or coaching topics.
 */
async function build(opts: {
  to: string;
  subject: string;
  template: string;
  eyebrow: string;
  reason: string;
  heading: string;
  body: string[];
  cta: string;
  /** Path on the site, or an absolute URL (invite links). */
  href: string;
  human?: boolean;
  extra?: { heading: string; items: string[] }[];
  payload?: Record<string, unknown>;
  unsubscribeUrl?: string;
}): Promise<OutgoingEmail> {
  const c = emailConfig();
  const url = opts.href.startsWith('http') ? opts.href : `${c.siteUrl}${opts.href}`;
  const { html, text } = await renderEmail(
    <EmailLayout
      preview={opts.heading}
      eyebrow={opts.eyebrow}
      reason={opts.reason}
      postalAddress={c.postalAddress}
      siteUrl={c.siteUrl}
    >
      <EmailHeading>{opts.heading}</EmailHeading>
      {opts.body.map((p) => (
        <EmailText key={p} muted>
          {p}
        </EmailText>
      ))}
      {opts.extra?.map((section) => (
        <div key={section.heading}>
          <EmailRule />
          <EmailText>{section.heading}</EmailText>
          {section.items.map((i) => (
            <EmailText key={i} muted>
              {i}
            </EmailText>
          ))}
        </div>
      ))}
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
    payload: { path: opts.href.startsWith('http') ? undefined : opts.href, ...opts.payload },
    unsubscribeUrl: opts.unsubscribeUrl,
  };
}

const accountReason = `You're receiving this because you manage a ${brand.name} subscription.`;

export const subscriptionStartedEmail = (to: string, planLabel: string, path: string) =>
  build({
    to,
    subject: `${planLabel} is active`,
    template: 'subscription-started',
    eyebrow: 'Billing',
    reason: accountReason,
    heading: `${planLabel} is active.`,
    body: ['Your subscription renews monthly. You can change or cancel it at any time.'],
    cta: 'Manage subscription',
    href: path,
  });

export const subscriptionPaymentFailedEmail = (to: string, planLabel: string, path: string) =>
  build({
    to,
    subject: `Payment for ${planLabel} did not go through`,
    template: 'subscription-payment-failed',
    eyebrow: 'Billing',
    reason: accountReason,
    heading: 'Your last payment did not go through.',
    body: [
      'Nothing has changed yet. Update your payment details and we will try again automatically.',
    ],
    cta: 'Update payment details',
    href: path,
    human: true,
  });

export const subscriptionEndedEmail = (to: string, planLabel: string, path: string) =>
  build({
    to,
    subject: `${planLabel} has ended`,
    template: 'subscription-ended',
    eyebrow: 'Billing',
    reason: accountReason,
    heading: `${planLabel} has ended.`,
    body: ['Your account and data are unchanged. You can subscribe again whenever you like.'],
    cta: 'View billing',
    href: path,
  });

/** Seat invitation. The link carries a single-use token; it expires in 14 days. */
export const seatInviteEmail = (opts: {
  to: string;
  companyName: string;
  inviterName: string;
  acceptUrl: string;
  expiresOn: string;
}) =>
  build({
    to: opts.to,
    subject: `${opts.inviterName} invited you to ${opts.companyName} on ${brand.name}`,
    template: 'seat-invite',
    eyebrow: 'Team',
    reason: `You're receiving this because ${opts.inviterName} entered this address. If you weren't expecting it, ignore this email.`,
    heading: `Join ${opts.companyName} on ${brand.name}.`,
    body: [
      `${opts.inviterName} invited you to a seat on their hiring team.`,
      `Sign in with this email address to accept. The invitation expires on ${opts.expiresOn}.`,
    ],
    cta: 'Accept invitation',
    href: opts.acceptUrl,
    human: true,
  });

/** To talent partners: a concierge member asked for coaching. No topic in the email. */
export const coachingRequestedEmail = (to: string) =>
  build({
    to,
    subject: 'A concierge member asked for coaching',
    template: 'coaching-requested',
    eyebrow: 'Concierge',
    reason: `You're receiving this as a ${brand.name} talent partner.`,
    heading: 'A concierge member asked for coaching.',
    body: ['Open the coaching queue to take it and propose a time.'],
    cta: 'Open coaching queue',
    href: '/console/coaching',
  });

export const coachingScheduledEmail = (to: string, when: string) =>
  build({
    to,
    subject: 'Your coaching session is scheduled',
    template: 'coaching-scheduled',
    eyebrow: 'Concierge',
    reason: `You're receiving this because you asked for coaching on ${brand.name}.`,
    heading: `Your coaching session is set for ${when}.`,
    body: ['Your talent partner will join at that time. You can cancel from your concierge page.'],
    cta: 'View concierge',
    href: '/me/concierge',
    human: true,
  });

/** Weekly career digest (spec 5.4.4). Opt-in; one click to stop. */
export const careerDigestEmail = (opts: {
  to: string;
  roles: string[];
  moves: string[];
  concierge: boolean;
  manageUrl: string;
}) =>
  build({
    to: opts.to,
    subject: opts.roles.length
      ? `${opts.roles.length} new ${opts.roles.length === 1 ? 'role' : 'roles'} for your next mandate`
      : 'This week on the CMO seat',
    template: 'career-digest',
    eyebrow: 'Career digest',
    reason: `You're receiving this because you turned on the weekly career digest. Turn it off on your ${brand.name} dashboard.`,
    heading: opts.roles.length ? 'Roles that fit what you told us.' : 'No new roles fit this week.',
    body: [
      'Matched against your ideal next mandate. Nobody sees that you received this.',
      ...(opts.concierge
        ? ['Want a second view on any of these? Your coach is one request away.']
        : []),
    ],
    extra: [
      ...(opts.roles.length ? [{ heading: 'New roles', items: opts.roles }] : []),
      ...(opts.moves.length ? [{ heading: 'Moves in your industries', items: opts.moves }] : []),
    ],
    cta: opts.concierge ? 'Talk to your coach' : 'See all roles',
    href: opts.concierge ? '/me/concierge' : '/jobs',
    unsubscribeUrl: opts.manageUrl,
  });
