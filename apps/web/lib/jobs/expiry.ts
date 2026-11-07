import 'server-only';
import { adminDb, audit, employerMembers, listings, mandates, users } from '@cmobeat/db';
import { sendEmail } from '@cmobeat/email';
import { and, eq, gt, isNull, lte } from 'drizzle-orm';
import { renewalReminderEmail } from '@/emails/jobs';

const DAY = 86_400_000;

/** Emails of the people who manage a company's listings (owners and admins first, else members). */
export async function employerContacts(companyId: string): Promise<string[]> {
  const rows = await adminDb()
    .select({ email: users.email, seat: employerMembers.seatRole })
    .from(employerMembers)
    .innerJoin(users, eq(users.id, employerMembers.userId))
    .where(and(eq(employerMembers.companyId, companyId), isNull(users.deletedAt)));
  const admins = rows.filter((r) => r.seat !== 'member');
  return (admins.length ? admins : rows).map((r) => r.email);
}

/**
 * Background job (system, owner connection), run daily.
 * 1. Live listings past expires_at become expired, each recorded in the audit log.
 * 2. Live listings closing in 6–7 days get one renewal reminder (the window is one day wide, so a
 *    daily run sends it once).
 */
export async function runListingExpiry({ now = new Date() }: { now?: Date } = {}) {
  const db = adminDb();
  const expired = await db
    .update(listings)
    .set({ status: 'expired' })
    .where(and(eq(listings.status, 'live'), lte(listings.expiresAt, now)))
    .returning({ id: listings.id });
  for (const l of expired) {
    await audit(db, {
      actorId: null,
      action: 'listing.expired',
      targetType: 'listing',
      targetId: l.id,
    });
  }

  const closing = await db
    .select({
      id: listings.id,
      companyId: listings.companyId,
      expiresAt: listings.expiresAt,
      title: mandates.title,
    })
    .from(listings)
    .innerJoin(mandates, eq(mandates.id, listings.mandateId))
    .where(
      and(
        eq(listings.status, 'live'),
        gt(listings.expiresAt, new Date(now.getTime() + 6 * DAY)),
        lte(listings.expiresAt, new Date(now.getTime() + 7 * DAY)),
        eq(listings.isSample, false),
      ),
    );
  let reminders = 0;
  for (const l of closing) {
    if (!l.companyId || !l.expiresAt) continue;
    const mail = renewalReminderEmail({
      listingTitle: l.title,
      expiresOn: l.expiresAt.toISOString().slice(0, 10),
      listingId: l.id,
    });
    for (const to of await employerContacts(l.companyId)) {
      await sendEmail({ to, template: 'listing-renewal', ...mail, payload: { listingId: l.id } });
      reminders++;
    }
  }
  return { expired: expired.map((e) => e.id), reminders };
}
