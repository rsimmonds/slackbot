import { adminDb, emailOutbox } from '@cmobeat/db';
import { desc, eq } from 'drizzle-orm';
import { Resend } from 'resend';
import { emailConfig } from './config';
import type { OutgoingEmail } from './index';

/** RFC 8058 one-click unsubscribe headers for bulk mail. */
export function unsubscribeHeaders(url?: string): Record<string, string> | undefined {
  if (!url) return undefined;
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/**
 * Records the email in email_outbox, then delivers it through the configured provider.
 * The outbox provider treats the row itself as the delivery (dev, CI, tests).
 * This is a system operation: it uses the owner connection, never a user's.
 */
export async function sendEmail(email: OutgoingEmail): Promise<{ id: string }> {
  const config = emailConfig();
  const db = adminDb();
  const headers = unsubscribeHeaders(email.unsubscribeUrl);
  const [row] = await db
    .insert(emailOutbox)
    .values({
      toEmail: email.to.toLowerCase(),
      subject: email.subject,
      template: email.template,
      payload: { ...(email.payload ?? {}), html: email.html, text: email.text, headers },
      provider: config.provider,
      status: config.provider === 'outbox' ? 'sent' : 'queued',
      sentAt: config.provider === 'outbox' ? new Date() : null,
    })
    .returning({ id: emailOutbox.id });
  const id = row!.id;

  if (config.provider === 'resend') {
    const resend = new Resend(config.resendApiKey);
    const { data, error } = await resend.emails.send({
      from: config.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers,
    });
    await db
      .update(emailOutbox)
      .set(
        error
          ? { status: 'failed', error: error.message }
          : { status: 'sent', providerRef: data?.id ?? null, sentAt: new Date() },
      )
      .where(eq(emailOutbox.id, id));
    if (error) throw new Error(`Email send failed: ${error.message}`);
  }
  return { id };
}

/** Test helper: newest email sent to an address. */
export async function latestEmailTo(to: string) {
  const [row] = await adminDb()
    .select()
    .from(emailOutbox)
    .where(eq(emailOutbox.toEmail, to.toLowerCase()))
    .orderBy(desc(emailOutbox.createdAt))
    .limit(1);
  return row ?? null;
}
