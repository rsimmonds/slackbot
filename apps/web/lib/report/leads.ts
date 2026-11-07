import 'server-only';
import { markets } from '@cmobeat/config';
import { adminDb, reportDownloads, subscribers, withAnon } from '@cmobeat/db';
import { newsletterConfirmEmail, reportDownloadEmail, sendEmail } from '@cmobeat/email';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { RateLimiter } from '@/lib/newsletter/rate-limit';
import { consentText } from '@/lib/newsletter/service';
import { REPORT_SLUG, REPORT_TITLE, REPORT_YEAR } from './data';
import { EMAIL_LINK_TTL_SECONDS, PAGE_LINK_TTL_SECONDS, reportDownloadPath } from './link';

/**
 * The report gate. Getting the report never requires marketing consent: the newsletter opt-in
 * is a separate, unticked box (CASL / GDPR). Every request is recorded as a lead in
 * report_downloads; only an explicit opt-in starts a newsletter double opt-in in subscribers.
 */
export const REPORT_SOURCE = `report:${REPORT_YEAR}`;

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const reportRequestSchema = z.object({
  email: z.email().max(254),
  company: optional(120),
  role: optional(120),
  market: z.enum(markets),
  // Unticked by default. Only the literal "on"/true opts in.
  newsletter: z
    .union([z.boolean(), z.literal('on'), z.literal('true'), z.literal('')])
    .optional()
    .transform((v) => v === true || v === 'on' || v === 'true'),
  // Honeypot: people never fill it.
  website: z.string().optional(),
});

export type ReportRequestResult =
  | { ok: true; downloadPath: string | null; newsletterPending: boolean }
  | { ok: false; error: 'invalid' | 'rate_limited'; message: string };

/** Five report requests per IP per hour (per server instance; see rate-limit.ts). */
export const reportLimiter = new RateLimiter(5, 60 * 60 * 1000);

export async function requestReport(
  raw: unknown,
  ctx: { ip?: string | null; limiter?: RateLimiter; now?: number } = {},
): Promise<ReportRequestResult> {
  const parsed = reportRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return {
      ok: false,
      error: 'invalid',
      message: field === 'market' ? 'Choose where you work.' : 'Enter a valid work email address.',
    };
  }
  const input = parsed.data;
  // A bot filled the honeypot: answer like a success, record and send nothing.
  if (input.website) return { ok: true, downloadPath: null, newsletterPending: false };

  const limiter = ctx.limiter ?? reportLimiter;
  if (!limiter.take(RateLimiter.keyFor(ctx.ip, 'report-request'))) {
    return {
      ok: false,
      error: 'rate_limited',
      message: 'Too many requests. Try again in an hour.',
    };
  }

  const email = input.email.toLowerCase();
  let subscriberId: string | null = null;
  let newsletterPending = false;
  if (input.newsletter) {
    // Same token-only path as the newsletter page: anonymous visitors never read subscribers.
    const token = await withAnon(async (tx) => {
      const rows = await tx.execute<{ token: string | null }>(
        sql`select app.newsletter_signup(${email}, ${REPORT_SOURCE}, ${input.market}::market,
                                         ${consentText}, ${'{report,newsletter}'}::text[]) as token`,
      );
      return rows[0]?.token ?? null;
    });
    if (token) {
      await sendEmail(await newsletterConfirmEmail(email, token));
      newsletterPending = true;
    }
    // Link the lead to the subscriber row (system read; the anonymous visitor never sees it).
    const [sub] = await adminDb()
      .select({ id: subscribers.id })
      .from(subscribers)
      .where(eq(subscribers.email, email))
      .limit(1);
    subscriberId = sub?.id ?? null;
  }

  const [lead] = await adminDb()
    .insert(reportDownloads)
    .values({
      reportSlug: REPORT_SLUG,
      email,
      newsletterOptIn: input.newsletter,
      subscriberId,
      company: input.company ?? null,
      role: input.role ?? null,
      market: input.market,
    })
    .returning({ id: reportDownloads.id });

  const now = ctx.now ?? Date.now();
  await sendEmail(
    await reportDownloadEmail(email, {
      title: REPORT_TITLE,
      downloadPath: reportDownloadPath(lead!.id, EMAIL_LINK_TTL_SECONDS, now),
      hours: EMAIL_LINK_TTL_SECONDS / 3600,
      newsletterPending,
    }),
  );
  return {
    ok: true,
    downloadPath: reportDownloadPath(lead!.id, PAGE_LINK_TTL_SECONDS, now),
    newsletterPending,
  };
}

/** True when the download id belongs to a real lead for this report. */
export async function isReportLead(downloadId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(downloadId)) return false;
  const [row] = await adminDb()
    .select({ slug: reportDownloads.reportSlug })
    .from(reportDownloads)
    .where(eq(reportDownloads.id, downloadId))
    .limit(1);
  return row?.slug === REPORT_SLUG;
}
