import { adminDb, emailOutbox } from '@cmobeat/db';
import { desc, eq } from 'drizzle-orm';
import type { OutgoingEmail } from './index';

/** CONTRACT: minimal outbox implementation. The email workstream adds Resend and templates. */
export async function sendEmail(email: OutgoingEmail): Promise<{ id: string }> {
  const [row] = await adminDb()
    .insert(emailOutbox)
    .values({
      toEmail: email.to.toLowerCase(),
      subject: email.subject,
      template: email.template,
      payload: { ...(email.payload ?? {}), html: email.html, text: email.text },
      provider: 'outbox',
      status: 'sent',
      sentAt: new Date(),
    })
    .returning({ id: emailOutbox.id });
  return { id: row!.id };
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
