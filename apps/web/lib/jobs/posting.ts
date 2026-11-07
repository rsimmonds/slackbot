import 'server-only';
import { currencies, defaultCurrency, markets, type Currency, type Market } from '@cmobeat/config';
import { parseListing } from '@cmobeat/ai';
import { audit, companies, employerMembers, listings, mandates, type Tx } from '@cmobeat/db';
import { paymentsProvider, type CheckoutPlan } from '@cmobeat/payments';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { levels } from './filters';

export class PostingError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'PostingError';
  }
}

/** Statuses in which the employer may still edit the mandate. Live listings change only via a new post. */
export const editableStatuses = ['draft', 'pending_payment', 'rejected'] as const;
const isEditable = (s: string) => (editableStatuses as readonly string[]).includes(s);

export async function employerCompany(tx: Tx, userId: string) {
  const [row] = await tx
    .select({ id: companies.id, name: companies.name, market: companies.market })
    .from(employerMembers)
    .innerJoin(companies, eq(companies.id, employerMembers.companyId))
    .where(eq(employerMembers.userId, userId))
    .limit(1);
  return row ?? null;
}

function requireEmployer(viewer: Viewer | null): asserts viewer is Viewer {
  if (!viewer) throw new PostingError('Sign in as an employer.', 401);
  if (!viewer.roles.includes('employer'))
    throw new PostingError('Only employers can post roles.', 403);
}

export const parseInput = z
  .object({
    text: z.string().trim().max(40_000).optional(),
    url: z
      .string()
      .trim()
      .url()
      .max(2_000)
      .optional()
      .or(z.literal('').transform(() => undefined)),
  })
  .refine((v) => !!v.text || !!v.url, { message: 'Paste a job description or a URL.' });

/**
 * Step 1: the Listing Parser turns pasted text into a draft mandate + draft listing.
 * The employer edits and confirms it next. Nothing is published here.
 */
export async function createDraftFromParse(
  viewer: Viewer | null,
  input: z.infer<typeof parseInput>,
) {
  requireEmployer(viewer);
  const result = await parseListing({ text: input.text, url: input.url, actorId: viewer.id });
  if (!result.ok) throw new PostingError(result.reason, 422);
  const p = result.output;

  return asViewer(viewer, async (tx) => {
    const company = await employerCompany(tx, viewer.id);
    if (!company) throw new PostingError('Your account is not linked to a company yet.', 403);
    const market: Market = p.market ?? company.market;
    const currency: Currency = p.currency ?? defaultCurrency[market];
    const [mandate] = await tx
      .insert(mandates)
      .values({
        companyId: company.id,
        source: 'listing',
        title: p.title,
        level: p.level,
        scope: p.scope,
        reportingLine: p.reportingLine,
        teamSize: p.teamSize,
        priorities: p.priorities,
        compMin: p.compMin,
        compMax: p.compMax,
        currency,
        compBasis: p.compBasis,
        workType: p.workType,
        location: p.location,
        remote: p.remote,
        market,
        rawSource: input.text ?? null,
        sourceUrl: input.url ?? null,
      })
      .returning({ id: mandates.id });
    const [listing] = await tx
      .insert(listings)
      .values({ mandateId: mandate!.id, companyId: company.id, status: 'draft', plan: 'standard' })
      .returning({ id: listings.id });
    await audit(tx, {
      actorId: viewer.id,
      action: 'listing.drafted',
      targetType: 'listing',
      targetId: listing!.id,
      metadata: { agentRunId: result.runId, gaps: p.gaps },
    });
    return { listingId: listing!.id, mandateId: mandate!.id, gaps: p.gaps };
  });
}

const optionalInt = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
  z.number().int().nonnegative().nullable(),
);

/** What the employer edits and confirms. Comp range, currency and basis are required. */
export const mandateInput = z
  .object({
    title: z.string().trim().min(2).max(120),
    level: z.enum(levels),
    scope: z
      .string()
      .trim()
      .max(1_000)
      .nullable()
      .transform((v) => v || null),
    reportingLine: z
      .string()
      .trim()
      .max(120)
      .nullable()
      .transform((v) => v || null),
    teamSize: optionalInt,
    priorities: z.array(z.string().trim().min(1).max(240)).max(8),
    compMin: z.preprocess(
      (v) => (v === '' ? undefined : Number(v)),
      z.number({ error: 'Add the bottom of the comp range.' }).int().positive(),
    ),
    compMax: z.preprocess(
      (v) => (v === '' ? undefined : Number(v)),
      z.number({ error: 'Add the top of the comp range.' }).int().positive(),
    ),
    currency: z.enum(currencies),
    compBasis: z.enum(['annual', 'monthly_retainer']),
    workType: z.enum(['full_time', 'fractional']),
    location: z
      .string()
      .trim()
      .max(120)
      .nullable()
      .transform((v) => v || null),
    remote: z.boolean(),
    market: z.enum(markets),
  })
  .refine((m) => m.compMax >= m.compMin, {
    message: 'The top of the range must be at least the bottom.',
    path: ['compMax'],
  })
  .refine((m) => (m.workType === 'fractional') === (m.compBasis === 'monthly_retainer'), {
    message: 'Fractional roles are priced as a monthly retainer; full-time roles as annual base.',
    path: ['compBasis'],
  });
export type MandateInput = z.infer<typeof mandateInput>;

/** Read a mandate form (FormData) into the shape mandateInput validates. */
export function mandateFromForm(fd: FormData) {
  const s = (k: string) => (fd.get(k) === null ? null : String(fd.get(k)));
  return {
    title: s('title') ?? '',
    level: s('level'),
    scope: s('scope'),
    reportingLine: s('reportingLine'),
    teamSize: s('teamSize'),
    priorities: String(fd.get('priorities') ?? '')
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean),
    compMin: s('compMin') ?? '',
    compMax: s('compMax') ?? '',
    currency: s('currency'),
    compBasis: s('compBasis'),
    workType: s('workType'),
    location: s('location'),
    remote: fd.get('remote') === 'on' || fd.get('remote') === '1',
    market: s('market'),
  };
}

export async function getEmployerListing(tx: Tx, listingId: string) {
  const [row] = await tx
    .select({ listing: listings, mandate: mandates })
    .from(listings)
    .innerJoin(mandates, eq(mandates.id, listings.mandateId))
    .where(and(eq(listings.id, listingId), isNull(listings.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** To-dos before a mandate can be confirmed. Shown in amber: a person must resolve them. */
export function mandateGaps(m: {
  compMin: number | null;
  compMax: number | null;
  reportingLine: string | null;
  priorities: string[];
  scope: string | null;
}) {
  const gaps: string[] = [];
  if (m.compMin === null || m.compMax === null)
    gaps.push('Add a comp range. Comp is required on every listing.');
  if (!m.reportingLine) gaps.push('Say who the role reports to.');
  if (m.priorities.length < 3) gaps.push('List at least three concrete priorities.');
  if (!m.scope) gaps.push('Describe the scope in a sentence or two.');
  return gaps;
}

/** Save edits; with `confirm`, the employer signs off on the mandate (the human decision). */
export async function saveMandate(
  viewer: Viewer | null,
  listingId: string,
  data: MandateInput,
  confirm: boolean,
) {
  requireEmployer(viewer);
  return asViewer(viewer, async (tx) => {
    const row = await getEmployerListing(tx, listingId);
    if (!row) throw new PostingError('Listing not found.', 404);
    if (!isEditable(row.listing.status))
      throw new PostingError('This listing can no longer be edited.', 409);
    const gaps = mandateGaps(data);
    if (confirm && gaps.length) throw new PostingError(gaps[0]!, 422);
    await tx
      .update(mandates)
      .set({ ...data, confirmedAt: confirm ? new Date() : null })
      .where(eq(mandates.id, row.mandate.id));
    if (confirm) {
      await audit(tx, {
        actorId: viewer.id,
        action: 'mandate.confirmed',
        targetType: 'mandate',
        targetId: row.mandate.id,
        metadata: { listingId },
      });
    }
    return { confirmed: confirm, gaps };
  });
}

export const checkoutInput = z.object({ plan: z.enum(['standard', 'featured']) });

/**
 * Step 3: pay. Creates a checkout session and moves the listing to pending_payment.
 * A rejected listing that was already paid goes straight back to review, without paying again.
 */
export async function startCheckout(
  viewer: Viewer | null,
  listingId: string,
  plan: CheckoutPlan,
  origin: string,
): Promise<{ kind: 'checkout'; url: string } | { kind: 'resubmitted' }> {
  requireEmployer(viewer);
  return asViewer(viewer, async (tx) => {
    const row = await getEmployerListing(tx, listingId);
    if (!row) throw new PostingError('Listing not found.', 404);
    const { listing, mandate } = row;
    if (!isEditable(listing.status))
      throw new PostingError('This listing is already submitted.', 409);
    if (!mandate.confirmedAt) throw new PostingError('Confirm the mandate before checkout.', 422);

    if (listing.paidAt) {
      await tx.update(listings).set({ status: 'pending_review' }).where(eq(listings.id, listingId));
      await audit(tx, {
        actorId: viewer.id,
        action: 'listing.resubmitted',
        targetType: 'listing',
        targetId: listingId,
      });
      return { kind: 'resubmitted' };
    }

    const session = await paymentsProvider().createCheckout({
      listingId,
      companyId: listing.companyId!,
      plan,
      customerEmail: viewer.email,
      successUrl: `${origin}/employer/jobs?paid=${listingId}`,
      cancelUrl: `${origin}/employer/jobs/${listingId}/edit?checkout=cancelled`,
    });
    await tx
      .update(listings)
      .set({ plan, checkoutRef: session.ref, status: 'pending_payment' })
      .where(eq(listings.id, listingId));
    await audit(tx, {
      actorId: viewer.id,
      action: 'listing.checkout_started',
      targetType: 'listing',
      targetId: listingId,
      metadata: { plan, ref: session.ref },
    });
    return { kind: 'checkout', url: session.url };
  });
}

/** The employer's listings, newest first. RLS limits this to their company. */
export async function employerListings(tx: Tx, companyId: string) {
  return tx
    .select({
      id: listings.id,
      status: listings.status,
      plan: listings.plan,
      paidAt: listings.paidAt,
      publishedAt: listings.publishedAt,
      expiresAt: listings.expiresAt,
      moderationNote: listings.moderationNote,
      createdAt: listings.createdAt,
      title: mandates.title,
      confirmedAt: mandates.confirmedAt,
    })
    .from(listings)
    .innerJoin(mandates, eq(mandates.id, listings.mandateId))
    .where(and(eq(listings.companyId, companyId), isNull(listings.deletedAt)))
    .orderBy(desc(listings.createdAt));
}
