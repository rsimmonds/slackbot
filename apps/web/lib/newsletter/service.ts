import { brand, markets } from '@cmobeat/config';
import { withAnon } from '@cmobeat/db';
import {
  newsletterConfirmEmail,
  newsletterProvider,
  newsletterWelcomeEmail,
  sendEmail,
} from '@cmobeat/email';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { RateLimiter, signupLimiter } from './rate-limit';

/*
 * Newsletter flows (double opt-in). The subscribers table is not readable by visitors; every
 * operation goes through the token-based SQL functions from migration 0004.
 * No Next.js imports here, so route handlers, server actions and tests share this module.
 */

export const topics = [
  { id: 'moves', label: 'CMO moves' },
  { id: 'interviews', label: 'Interviews' },
  { id: 'comp', label: 'Comp data' },
  { id: 'jobs', label: 'Senior roles' },
] as const;
export type TopicId = (typeof topics)[number]['id'];
const topicIds = topics.map((t) => t.id) as [TopicId, ...TopicId[]];

/** Exact wording shown next to the signup button. Stored with each consent (CASL). */
export const consentText = `I want to receive ${brand.newsletterName}, the ${brand.name} newsletter, by email. I can unsubscribe at any time with one click.`;

export const signupSchema = z.object({
  email: z.email().max(254),
  market: z.enum(markets).optional(),
  topics: z.array(z.enum(topicIds)).max(topics.length).optional(),
  source: z.string().max(64).optional(),
  /** Honeypot: hidden from people, filled in by bots. */
  website: z.string().max(200).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/i, 'invalid token');

export const preferencesSchema = z.object({
  frequency: z.enum(['weekly', 'monthly']),
  topics: z.array(z.enum(topicIds)).max(topics.length),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export type SignupResult =
  { ok: true } | { ok: false; error: 'invalid' | 'rate_limited'; message: string };

/**
 * Starts a subscription. The response is identical whether or not the address already exists,
 * so the form never reveals who subscribes. Bots that fill the honeypot get the same response
 * and nothing happens.
 */
export async function signup(
  raw: unknown,
  ctx: { ip?: string | null; limiter?: RateLimiter } = {},
): Promise<SignupResult> {
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid', message: 'Enter a valid email address.' };
  }
  const input = parsed.data;
  if (input.website) return { ok: true };

  const limiter = ctx.limiter ?? signupLimiter;
  if (!limiter.take(RateLimiter.keyFor(ctx.ip, 'newsletter-signup'))) {
    return {
      ok: false,
      error: 'rate_limited',
      message: 'Too many attempts. Try again in an hour.',
    };
  }

  const email = input.email.trim().toLowerCase();
  const segments = input.topics ?? [];
  const token = await withAnon(async (tx) => {
    const rows = await tx.execute<{ token: string | null }>(
      sql`select app.newsletter_signup(${email}, ${input.source ?? 'site'}, ${input.market ?? null}::market,
                                       ${consentText}, ${pgTextArray(segments)}::text[]) as token`,
    );
    return rows[0]?.token ?? null;
  });
  if (token) await sendEmail(await newsletterConfirmEmail(email, token));
  return { ok: true };
}

/** Activates a pending subscription. Returns false for an unknown, used or expired token. */
export async function confirm(rawToken: unknown): Promise<boolean> {
  const t = tokenSchema.safeParse(rawToken);
  if (!t.success) return false;
  const manage = await withAnon(async (tx) => {
    const rows = await tx.execute<{ manage: string | null }>(
      sql`select app.newsletter_confirm(${t.data}) as manage`,
    );
    return rows[0]?.manage ?? null;
  });
  if (!manage) return false;
  const sub = await getSubscription(manage);
  if (sub) {
    await sendEmail(await newsletterWelcomeEmail(sub.email, manage));
    await newsletterProvider().upsertContact(sub.email);
  }
  return true;
}

export interface Subscription {
  email: string;
  status: 'pending' | 'active' | 'unsubscribed';
  preferences: Preferences;
}

export async function getSubscription(rawToken: unknown): Promise<Subscription | null> {
  const t = tokenSchema.safeParse(rawToken);
  if (!t.success) return null;
  return withAnon(async (tx) => {
    const rows = await tx.execute<{
      email: string;
      status: Subscription['status'];
      preferences: { frequency?: string; topics?: string[] };
    }>(sql`select email, status, preferences from app.newsletter_get(${t.data})`);
    const r = rows[0];
    if (!r) return null;
    const prefs = preferencesSchema.safeParse(r.preferences);
    return {
      email: r.email,
      status: r.status,
      preferences: prefs.success ? prefs.data : { frequency: 'weekly', topics: [] },
    };
  });
}

export async function updatePreferences(rawToken: unknown, raw: unknown): Promise<boolean> {
  const t = tokenSchema.safeParse(rawToken);
  const p = preferencesSchema.safeParse(raw);
  if (!t.success || !p.success) return false;
  return withAnon(async (tx) => {
    const rows = await tx.execute<{ ok: boolean }>(
      sql`select app.newsletter_update(${t.data}, ${JSON.stringify(p.data)}::jsonb, ${pgTextArray(p.data.topics)}::text[]) as ok`,
    );
    return rows[0]?.ok === true;
  });
}

/** One-click unsubscribe. Idempotent; true when the token matched a subscriber. */
export async function unsubscribe(rawToken: unknown): Promise<boolean> {
  const t = tokenSchema.safeParse(rawToken);
  if (!t.success) return false;
  const sub = await getSubscription(t.data);
  const ok = await withAnon(async (tx) => {
    const rows = await tx.execute<{ ok: boolean }>(
      sql`select app.newsletter_unsubscribe(${t.data}) as ok`,
    );
    return rows[0]?.ok === true;
  });
  if (ok && sub) await newsletterProvider().removeContact(sub.email);
  return ok;
}

/** Postgres array literal for validated topic ids (letters only; see topicIds). */
function pgTextArray(values: readonly string[]): string {
  if (values.some((v) => !/^[a-z]+$/.test(v))) throw new Error('unexpected array value');
  return `{${values.join(',')}}`;
}

/** Masks an address for display on token pages: r***@example.com */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) return email;
  return `${user[0]}${'•'.repeat(Math.min(6, Math.max(2, user.length - 1)))}@${domain}`;
}
