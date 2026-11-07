import { adminDb, subscribers } from '@cmobeat/db';
import { and, eq, sql } from 'drizzle-orm';
import { Resend } from 'resend';
import { emailConfig, type EmailConfig } from './config';
import { sendEmail } from './send';

/**
 * The newsletter list lives in Postgres (subscribers). A provider delivers issues to it.
 * Outbox is the default for dev and CI; Resend Broadcasts is the first live adapter, and a
 * beehiiv adapter can implement the same interface later (spec 8.4).
 */
export interface NewsletterIssue {
  id: string;
  subject: string;
  html: string;
  text: string;
  /** Only send to subscribers with this topic, when set. */
  topic?: string;
}

export interface NewsletterProvider {
  readonly name: 'outbox' | 'resend';
  /** Mirror a confirmed subscriber to the provider (no-op for outbox). */
  upsertContact(email: string): Promise<void>;
  /** Mirror an unsubscribe to the provider (no-op for outbox). */
  removeContact(email: string): Promise<void>;
  /** Deliver an approved issue. Returns the provider's reference. */
  sendIssue(issue: NewsletterIssue): Promise<{ ref: string; recipients?: number }>;
}

/**
 * Writes one outbox row per active subscriber, each with its own one-click unsubscribe link.
 * Used in dev and CI; never leaves the database.
 */
export class OutboxNewsletterProvider implements NewsletterProvider {
  readonly name = 'outbox' as const;
  constructor(private readonly config: EmailConfig = emailConfig()) {}

  async upsertContact(): Promise<void> {}
  async removeContact(): Promise<void> {}

  async sendIssue(issue: NewsletterIssue) {
    const rows = await adminDb()
      .select({ email: subscribers.email, manageToken: subscribers.manageToken })
      .from(subscribers)
      .where(
        and(
          eq(subscribers.status, 'active'),
          issue.topic ? sql`${subscribers.preferences}->'topics' ? ${issue.topic}` : undefined,
        ),
      );
    for (const r of rows) {
      const t = encodeURIComponent(r.manageToken ?? '');
      await sendEmail({
        to: r.email,
        subject: issue.subject,
        template: 'newsletter-issue',
        html: issue.html.replaceAll(
          '{{unsubscribe_url}}',
          `${this.config.siteUrl}/newsletter/unsubscribe?token=${t}`,
        ),
        text: issue.text.replaceAll(
          '{{unsubscribe_url}}',
          `${this.config.siteUrl}/newsletter/unsubscribe?token=${t}`,
        ),
        payload: { issueId: issue.id },
        unsubscribeUrl: `${this.config.siteUrl}/api/newsletter/unsubscribe?token=${t}`,
      });
    }
    return { ref: `outbox:${issue.id}`, recipients: rows.length };
  }
}

/**
 * Resend Broadcasts adapter. Contacts are mirrored into one segment; Resend renders its own
 * unsubscribe link via {{{RESEND_UNSUBSCRIBE_URL}}}.
 * NOT YET TESTED AGAINST THE LIVE API: verify with a test segment before the first send.
 */
export class ResendNewsletterProvider implements NewsletterProvider {
  readonly name = 'resend' as const;
  private readonly resend: Resend;
  constructor(private readonly config: EmailConfig = emailConfig()) {
    if (!config.resendApiKey || !config.resendSegmentId) {
      throw new Error('Resend newsletter needs RESEND_API_KEY and RESEND_NEWSLETTER_SEGMENT_ID');
    }
    this.resend = new Resend(config.resendApiKey);
  }

  async upsertContact(email: string): Promise<void> {
    const { error } = await this.resend.contacts.create({
      email,
      unsubscribed: false,
      segments: [{ id: this.config.resendSegmentId! }],
    });
    if (error && !/already exists/i.test(error.message)) throw new Error(error.message);
  }

  async removeContact(email: string): Promise<void> {
    const { error } = await this.resend.contacts.update({ email, unsubscribed: true });
    if (error) throw new Error(error.message);
  }

  async sendIssue(issue: NewsletterIssue) {
    const unsub = '{{{RESEND_UNSUBSCRIBE_URL}}}';
    const { data, error } = await this.resend.broadcasts.create({
      name: `Issue ${issue.id}`,
      segmentId: this.config.resendSegmentId!,
      from: this.config.from,
      subject: issue.subject,
      html: issue.html.replaceAll('{{unsubscribe_url}}', unsub),
      text: issue.text.replaceAll('{{unsubscribe_url}}', unsub),
    });
    if (error || !data) throw new Error(error?.message ?? 'Broadcast create failed');
    const sent = await this.resend.broadcasts.send(data.id);
    if (sent.error) throw new Error(sent.error.message);
    return { ref: data.id };
  }
}

export function newsletterProvider(config: EmailConfig = emailConfig()): NewsletterProvider {
  return config.provider === 'resend'
    ? new ResendNewsletterProvider(config)
    : new OutboxNewsletterProvider(config);
}
