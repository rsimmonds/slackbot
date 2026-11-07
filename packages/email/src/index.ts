/**
 * Public contract of @cmobeat/email.
 *
 * sendEmail() always records the message in email_outbox. With EMAIL_PROVIDER=resend it also sends
 * through Resend; with EMAIL_PROVIDER=outbox (default in dev/CI) the outbox row is the delivery,
 * and tests read it back with latestEmailTo().
 */
export interface OutgoingEmail {
  to: string;
  subject: string;
  /** Template name, recorded for audit, e.g. "newsletter-confirm". */
  template: string;
  html: string;
  text: string;
  /** Data the template used. Never include candidate PII. */
  payload?: Record<string, unknown>;
  /** List-Unsubscribe URL for bulk mail (RFC 8058 one-click). */
  unsubscribeUrl?: string;
}

export { sendEmail, latestEmailTo } from './send';
export { emailConfig, type EmailConfig } from './config';
export { renderEmail } from './render';
export {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailRule,
  EmailText,
  emailTokens,
  type EmailLayoutProps,
} from './templates/Layout';
export { newsletterConfirmEmail, newsletterWelcomeEmail } from './templates/newsletter';
export {
  introductionRequestedEmail,
  matchApprovedEmail,
  newMessageEmail,
  revealDecisionEmail,
} from './templates/matching';
export {
  SponsorshipBlock,
  sponsorshipText,
  type SponsorshipCreative,
} from './templates/Sponsorship';
export { activeSponsorship, type SponsorshipPlacement } from './sponsorship';
export {
  newsletterProvider,
  OutboxNewsletterProvider,
  ResendNewsletterProvider,
  type NewsletterIssue,
  type NewsletterProvider,
} from './newsletter';
