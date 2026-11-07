import { brand } from '@cmobeat/config';
import { Link } from '@react-email/components';
import { emailConfig } from '../config';
import type { OutgoingEmail } from '../index';
import { renderEmail } from '../render';
import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailRule,
  EmailText,
  emailTokens,
} from './Layout';

/** Double opt-in: the address owner confirms before anything else is sent. */
export async function newsletterConfirmEmail(
  to: string,
  confirmToken: string,
): Promise<OutgoingEmail> {
  const c = emailConfig();
  const confirmUrl = `${c.siteUrl}/newsletter/confirm?token=${encodeURIComponent(confirmToken)}`;
  const { html, text } = await renderEmail(
    <EmailLayout
      preview={`Confirm your subscription to ${brand.newsletterName}`}
      eyebrow="Newsletter · Confirm"
      reason={`Someone asked to subscribe this address to ${brand.newsletterName}. If it wasn't you, ignore this email and nothing will happen.`}
      postalAddress={c.postalAddress}
      siteUrl={c.siteUrl}
    >
      <EmailHeading>One step left.</EmailHeading>
      <EmailText muted>
        Confirm that you want {brand.newsletterName}: CMO moves, interviews and comp data, weekly.
        The link expires in 48 hours.
      </EmailText>
      <EmailButton href={confirmUrl} human>
        Confirm subscription
      </EmailButton>
      <EmailText muted>
        Or paste this link into your browser:{' '}
        <Link href={confirmUrl} style={{ color: emailTokens.text2, wordBreak: 'break-all' }}>
          {confirmUrl}
        </Link>
      </EmailText>
    </EmailLayout>,
  );
  return {
    to,
    subject: `Confirm your subscription to ${brand.newsletterName}`,
    template: 'newsletter-confirm',
    html,
    text,
    payload: { kind: 'confirm' },
  };
}

/** Sent once the address is confirmed. Carries the preference and unsubscribe links. */
export async function newsletterWelcomeEmail(
  to: string,
  manageToken: string,
): Promise<OutgoingEmail> {
  const c = emailConfig();
  const t = encodeURIComponent(manageToken);
  const preferencesUrl = `${c.siteUrl}/newsletter/preferences?token=${t}`;
  const unsubscribeUrl = `${c.siteUrl}/newsletter/unsubscribe?token=${t}`;
  const { html, text } = await renderEmail(
    <EmailLayout
      preview={`You're subscribed to ${brand.newsletterName}`}
      eyebrow="Newsletter · Welcome"
      reason={`You're receiving this because you confirmed a subscription to ${brand.newsletterName}.`}
      postalAddress={c.postalAddress}
      siteUrl={c.siteUrl}
      preferencesUrl={preferencesUrl}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>You&apos;re subscribed.</EmailHeading>
      <EmailText muted>
        {brand.newsletterName} arrives weekly. Every item in it is reviewed by an editor before it
        goes out.
      </EmailText>
      <EmailRule />
      <EmailText muted>Choose weekly or monthly, and which topics you want, at any time.</EmailText>
      <EmailButton href={preferencesUrl}>Set preferences</EmailButton>
    </EmailLayout>,
  );
  return {
    to,
    subject: `Welcome to ${brand.newsletterName}`,
    template: 'newsletter-welcome',
    html,
    text,
    payload: { kind: 'welcome' },
    unsubscribeUrl: `${c.siteUrl}/api/newsletter/unsubscribe?token=${t}`,
  };
}
