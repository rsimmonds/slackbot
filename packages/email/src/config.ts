import { brand } from '@cmobeat/config';

export interface EmailConfig {
  provider: 'outbox' | 'resend';
  resendApiKey?: string;
  from: string;
  /** Public site origin for links in emails, e.g. https://cmobeat.com */
  siteUrl: string;
  /** Physical postal address for the footer (CAN-SPAM, CASL). */
  postalAddress: string;
  /** Resend segment that receives newsletter broadcasts. */
  resendSegmentId?: string;
}

/**
 * Email settings from env. Defaults keep dev and CI on the outbox provider, which never
 * sends anything outside the database.
 */
export function emailConfig(env: NodeJS.ProcessEnv = process.env): EmailConfig {
  const provider = env.EMAIL_PROVIDER === 'resend' ? 'resend' : 'outbox';
  if (provider === 'resend' && !env.RESEND_API_KEY) {
    throw new Error('EMAIL_PROVIDER=resend needs RESEND_API_KEY');
  }
  return {
    provider,
    resendApiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM || `${brand.name} <hello@${brand.domain}>`,
    siteUrl: (env.SITE_URL || `https://${brand.domain}`).replace(/\/$/, ''),
    postalAddress: env.COMPANY_POSTAL_ADDRESS || 'Postal address to be confirmed before launch',
    resendSegmentId: env.RESEND_NEWSLETTER_SEGMENT_ID || undefined,
  };
}
