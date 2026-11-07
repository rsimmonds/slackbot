import { brand } from '@cmobeat/config';
import { Link } from '@react-email/components';
import { emailConfig } from '../config';
import type { OutgoingEmail } from '../index';
import { renderEmail } from '../render';
import { EmailButton, EmailHeading, EmailLayout, EmailText, emailTokens } from './Layout';

/**
 * Delivers the annual report someone asked for. Transactional: it is not a newsletter
 * subscription, carries no marketing, and is sent once per request.
 */
export async function reportDownloadEmail(
  to: string,
  opts: { title: string; downloadPath: string; hours: number; newsletterPending: boolean },
): Promise<OutgoingEmail> {
  const c = emailConfig();
  const url = `${c.siteUrl}${opts.downloadPath}`;
  const { html, text } = await renderEmail(
    <EmailLayout
      preview={`Your copy of ${opts.title}`}
      eyebrow="Annual report"
      reason={`You're receiving this because this address asked for ${opts.title} on ${brand.name}. This is a one-off email, not a subscription.`}
      postalAddress={c.postalAddress}
      siteUrl={c.siteUrl}
    >
      <EmailHeading>Your report is ready.</EmailHeading>
      <EmailText muted>
        {`${opts.title}: a year of CMO moves and advertised comp, reviewed by editors. The link works for ${opts.hours} hours.`}
      </EmailText>
      <EmailButton href={url}>Download the report</EmailButton>
      <EmailText muted>
        Or paste this link into your browser:{' '}
        <Link href={url} style={{ color: emailTokens.text2, wordBreak: 'break-all' }}>
          {url}
        </Link>
      </EmailText>
      {opts.newsletterPending ? (
        <EmailText muted>
          {`You also asked for ${brand.newsletterName}. A separate email asks you to confirm; nothing is sent until you do.`}
        </EmailText>
      ) : null}
    </EmailLayout>,
  );
  return {
    to,
    subject: `Your copy of ${opts.title}`,
    template: 'report-download',
    html,
    text,
    payload: { kind: 'report', newsletterPending: opts.newsletterPending },
  };
}
