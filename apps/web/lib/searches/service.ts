import 'server-only';
import type { SearchPlan } from '@cmobeat/config';
import {
  adminDb,
  audit,
  auditLog,
  candidateProfiles,
  companies,
  consents,
  mandates,
  matches,
  payments,
  revealRequests,
  searches,
  userRoles,
  users,
} from '@cmobeat/db';
import { sendEmail } from '@cmobeat/email';
import { and, asc, desc, eq, inArray, isNull, like, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { searchRequestedEmail, searchUpdateEmail } from '@/emails/searches';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { employerContacts } from '@/lib/jobs/expiry';
import { PostingError } from '@/lib/jobs/posting';
import { proposeMatchesForMandate } from '@/lib/matching';
import { appUrl as appUrlFor } from '@/emails/layout';
import { issueFractionalInvoice, issueSuccessFeeInvoice } from './invoices';
import { planForWorkType, snapshotTerms } from './terms';

/** Errors the search flows raise. Extends PostingError so the shared API error mapper handles it. */
export class SearchError extends PostingError {
  constructor(message: string, status = 400) {
    super(message, status);
    this.name = 'SearchError';
  }
}

export const searchStatuses = [
  'scoping',
  'sourcing',
  'shortlist',
  'interviewing',
  'placed',
  'closed',
] as const;
export type SearchStatus = (typeof searchStatuses)[number];

/** Allowed manual moves. "placed" happens only through placement, which records the hire. */
const nextStatuses: Record<SearchStatus, SearchStatus[]> = {
  scoping: ['sourcing', 'closed'],
  sourcing: ['shortlist', 'closed'],
  shortlist: ['interviewing', 'closed'],
  interviewing: ['closed'],
  placed: ['closed'],
  closed: [],
};
export const allowedMoves = (s: SearchStatus) => nextStatuses[s];

export const statusLabel: Record<SearchStatus, string> = {
  scoping: 'Scoping',
  sourcing: 'Sourcing',
  shortlist: 'Shortlist',
  interviewing: 'Interviewing',
  placed: 'Placed',
  closed: 'Closed',
};

// ------------------------------------------------------------------ inputs

export const requestInput = z.object({
  mandateId: z.string().uuid(),
  plan: z.enum(['ai_search', 'fractional_match']),
  acceptTerms: z.literal(true, { message: 'Accept the fee terms to request a search.' }),
});
export const statusInput = z.object({ status: z.enum(searchStatuses) });
export const placeInput = z.object({
  matchId: z.string().uuid(),
  /** First-year cash comp (AI-assisted search) or monthly retainer (fractional), whole units. */
  comp: z.coerce
    .number()
    .int('Enter a whole amount, without cents.')
    .positive('Enter the agreed amount.')
    .max(100_000_000, 'That amount looks too large.'),
});

// ------------------------------------------------------------------ guards

function requireEmployer(viewer: Viewer | null): asserts viewer is Viewer {
  if (!viewer) throw new SearchError('Sign in as an employer.', 401);
  if (!viewer.roles.includes('employer'))
    throw new SearchError('Searches are requested by employers.', 403);
}

const isTalent = (v: Viewer) => v.roles.includes('talent_partner') || v.roles.includes('admin');

function requireTalent(viewer: Viewer | null): asserts viewer is Viewer {
  if (!viewer) throw new SearchError('Sign in.', 401);
  if (!isTalent(viewer)) throw new SearchError('Searches are run by talent partners.', 403);
}

// ------------------------------------------------------------------ employer

/** Employer requests a paid search on a confirmed mandate, accepting a snapshot of the fee terms. */
export async function requestSearch(viewer: Viewer | null, raw: unknown) {
  requireEmployer(viewer);
  const input = requestInput.parse(raw);
  const result = await asViewer(viewer, async (tx) => {
    const [m] = await tx
      .select({
        id: mandates.id,
        title: mandates.title,
        companyId: mandates.companyId,
        confirmedAt: mandates.confirmedAt,
        workType: mandates.workType,
        currency: mandates.currency,
      })
      .from(mandates)
      .where(eq(mandates.id, input.mandateId))
      .limit(1);
    if (!m) throw new SearchError('Mandate not found.', 404);
    if (!m.confirmedAt)
      throw new SearchError('Confirm the mandate before requesting a search.', 409);
    const plan = planForWorkType(m.workType);
    if (plan !== input.plan)
      throw new SearchError(
        m.workType === 'fractional'
          ? 'Fractional mandates use a fractional match.'
          : 'Full-time mandates use an AI-assisted search.',
        400,
      );
    const [open] = await tx
      .select({ id: searches.id })
      .from(searches)
      .where(and(eq(searches.mandateId, m.id), ne(searches.status, 'closed')))
      .limit(1);
    if (open) throw new SearchError('A search for this mandate is already open.', 409);
    const [row] = await tx
      .insert(searches)
      .values({
        mandateId: m.id,
        plan,
        status: 'scoping',
        feeTerms: snapshotTerms(plan, m.currency, viewer.id),
      })
      .returning({ id: searches.id });
    await audit(tx, {
      actorId: viewer.id,
      action: 'search.requested',
      targetType: 'search',
      targetId: row!.id,
      metadata: {
        mandateId: m.id,
        plan,
        termsVersion: snapshotTerms(plan, m.currency, viewer.id).version,
      },
    });
    return { id: row!.id, plan, title: m.title };
  });

  // Tell the talent partners. No candidate data is involved.
  const partners = await adminDb()
    .selectDistinct({ email: users.email })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(inArray(userRoles.role, ['talent_partner', 'admin']), isNull(users.deletedAt)));
  const mail = searchRequestedEmail({
    title: result.title,
    plan: result.plan,
    url: `${appUrlFor()}/console/searches/${result.id}`,
  });
  for (const p of partners) {
    await sendEmail({
      to: p.email,
      template: 'search-requested',
      ...mail,
      payload: { searchId: result.id },
    });
  }
  return { id: result.id };
}

const searchColumns = {
  id: searches.id,
  mandateId: searches.mandateId,
  plan: searches.plan,
  status: searches.status,
  talentPartnerId: searches.talentPartnerId,
  feeTerms: searches.feeTerms,
  placedMatchId: searches.placedMatchId,
  hiredAt: searches.hiredAt,
  placementComp: searches.placementComp,
  placementCurrency: searches.placementCurrency,
  invoiceStatus: searches.invoiceStatus,
  createdAt: searches.createdAt,
  updatedAt: searches.updatedAt,
  title: mandates.title,
  currency: mandates.currency,
  workType: mandates.workType,
  companyId: mandates.companyId,
};

export type SearchRow = Awaited<ReturnType<typeof listEmployerSearches>>[number];

export async function listEmployerSearches(viewer: Viewer | null) {
  requireEmployer(viewer);
  return asViewer(viewer, (tx) =>
    tx
      .select(searchColumns)
      .from(searches)
      .innerJoin(mandates, eq(mandates.id, searches.mandateId))
      .where(sql`${mandates.companyId} in (select app.my_company_ids())`)
      .orderBy(desc(searches.createdAt)),
  );
}

/** Open search for a mandate, if any (for the mandate page's "Request a search" entry). */
export async function openSearchForMandate(viewer: Viewer, mandateId: string) {
  return asViewer(viewer, async (tx) => {
    const [row] = await tx
      .select({ id: searches.id, status: searches.status })
      .from(searches)
      .where(and(eq(searches.mandateId, mandateId), ne(searches.status, 'closed')))
      .limit(1);
    return row ?? null;
  });
}

export interface TimelineEntry {
  at: Date;
  label: string;
}

const timelineLabel = (action: string, meta: Record<string, unknown>): string | null => {
  switch (action) {
    case 'search.requested':
      return 'Search requested and fee terms accepted';
    case 'search.assigned':
      return 'A talent partner took the search';
    case 'search.status':
      return `Moved to ${statusLabel[meta.to as SearchStatus] ?? String(meta.to)}`;
    case 'search.placed':
      return 'Placement recorded';
    case 'invoice.issued':
      return 'Invoice issued';
    case 'invoice.paid':
      return 'Invoice paid';
    default:
      return null;
  }
};

/** Status history from the audit log, reduced to what the requester may see (no names, no notes). */
async function timeline(searchId: string): Promise<TimelineEntry[]> {
  const rows = await adminDb()
    .select({ action: auditLog.action, metadata: auditLog.metadata, at: auditLog.at })
    .from(auditLog)
    .where(and(eq(auditLog.targetType, 'search'), eq(auditLog.targetId, searchId)))
    .orderBy(asc(auditLog.at));
  return rows.flatMap((r) => {
    const label = timelineLabel(r.action, r.metadata);
    return label ? [{ at: r.at, label }] : [];
  });
}

const invoicesForSearch = (searchId: string) =>
  or(
    eq(payments.product, `search_fee:${searchId}`),
    like(payments.product, `fractional_fee:${searchId}:%`),
  );

/** Employer view of one search: details, timeline and its invoices. RLS decides visibility. */
export async function getEmployerSearch(viewer: Viewer | null, id: string) {
  requireEmployer(viewer);
  const data = await asViewer(viewer, async (tx) => {
    const [s] = await tx
      .select(searchColumns)
      .from(searches)
      .innerJoin(mandates, eq(mandates.id, searches.mandateId))
      .where(eq(searches.id, id))
      .limit(1);
    if (!s) return null;
    const invoices = await tx
      .select({
        ref: payments.stripeRef,
        product: payments.product,
        amount: payments.amount,
        currency: payments.currency,
        status: payments.status,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(invoicesForSearch(id))
      .orderBy(desc(payments.createdAt));
    return { search: s, invoices };
  });
  if (!data) throw new SearchError('Search not found.', 404);
  // The audit log is staff-only under RLS; read just this search's entries after the check above.
  return { ...data, timeline: await timeline(id) };
}

// ------------------------------------------------------------------ talent partners

export async function listConsoleSearches(viewer: Viewer | null) {
  requireTalent(viewer);
  return asViewer(viewer, (tx) =>
    tx
      .select({ ...searchColumns, companyName: companies.name })
      .from(searches)
      .innerJoin(mandates, eq(mandates.id, searches.mandateId))
      .innerJoin(companies, eq(companies.id, mandates.companyId))
      .orderBy(
        sql`case when ${searches.status} = 'closed' then 2 when ${searches.talentPartnerId} is null then 0 else 1 end`,
        asc(searches.createdAt),
      ),
  );
}

export async function getConsoleSearch(viewer: Viewer | null, id: string) {
  requireTalent(viewer);
  const data = await asViewer(viewer, async (tx) => {
    const [s] = await tx
      .select({ ...searchColumns, companyName: companies.name })
      .from(searches)
      .innerJoin(mandates, eq(mandates.id, searches.mandateId))
      .innerJoin(companies, eq(companies.id, mandates.companyId))
      .where(eq(searches.id, id))
      .limit(1);
    if (!s) return null;
    const revealed = await tx
      .select({
        id: matches.id,
        headline: candidateProfiles.headline,
        reviewedAt: matches.reviewedAt,
      })
      .from(matches)
      .leftJoin(candidateProfiles, eq(candidateProfiles.id, matches.profileId))
      .where(and(eq(matches.mandateId, s.mandateId), eq(matches.status, 'revealed')))
      .orderBy(desc(matches.updatedAt));
    return { search: s, revealed };
  });
  if (!data) throw new SearchError('Search not found.', 404);
  return { ...data, timeline: await timeline(id) };
}

async function loadForChange(viewer: Viewer, id: string) {
  return asViewer(viewer, async (tx) => {
    const [s] = await tx
      .select(searchColumns)
      .from(searches)
      .innerJoin(mandates, eq(mandates.id, searches.mandateId))
      .where(eq(searches.id, id))
      .limit(1);
    return s ?? null;
  });
}

function requireOwner(viewer: Viewer, s: { talentPartnerId: string | null }) {
  if (s.talentPartnerId === viewer.id || viewer.roles.includes('admin')) return;
  throw new SearchError(
    s.talentPartnerId ? 'Another talent partner runs this search.' : 'Take the search first.',
    403,
  );
}

async function notifyEmployer(companyId: string, searchId: string, title: string, update: string) {
  const mail = searchUpdateEmail({
    title,
    update,
    url: `${appUrlFor()}/employer/searches/${searchId}`,
  });
  for (const to of await employerContacts(companyId)) {
    await sendEmail({ to, template: 'search-update', ...mail, payload: { searchId } });
  }
}

/** A talent partner takes an unassigned search. */
export async function assignSearch(viewer: Viewer | null, id: string) {
  requireTalent(viewer);
  const updated = await asViewer(viewer, async (tx) => {
    const rows = await tx
      .update(searches)
      .set({ talentPartnerId: viewer.id })
      .where(
        and(eq(searches.id, id), isNull(searches.talentPartnerId), ne(searches.status, 'closed')),
      )
      .returning({ id: searches.id });
    if (rows.length) {
      await audit(tx, {
        actorId: viewer.id,
        action: 'search.assigned',
        targetType: 'search',
        targetId: id,
      });
    }
    return rows.length > 0;
  });
  if (!updated) {
    const s = await loadForChange(viewer, id);
    if (!s) throw new SearchError('Search not found.', 404);
    if (s.talentPartnerId === viewer.id) return { id };
    throw new SearchError('This search already has a talent partner.', 409);
  }
  return { id };
}

/**
 * Move a search along. Moving to "sourcing" runs blind matching for the mandate; if matching is
 * not available yet the move still happens and the caller gets a plain warning.
 */
export async function changeStatus(
  viewer: Viewer | null,
  id: string,
  raw: unknown,
): Promise<{ id: string; status: SearchStatus; warning?: string; proposed?: number }> {
  requireTalent(viewer);
  const { status } = statusInput.parse(raw);
  const s = await loadForChange(viewer, id);
  if (!s) throw new SearchError('Search not found.', 404);
  requireOwner(viewer, s);
  const from = s.status as SearchStatus;
  if (!allowedMoves(from).includes(status))
    throw new SearchError(
      status === 'placed'
        ? 'Record the placement to mark a search placed.'
        : `A search can't move from ${statusLabel[from].toLowerCase()} to ${statusLabel[status].toLowerCase()}.`,
      409,
    );
  await asViewer(viewer, async (tx) => {
    const rows = await tx
      .update(searches)
      .set({ status })
      .where(and(eq(searches.id, id), eq(searches.status, from)))
      .returning({ id: searches.id });
    if (!rows.length) throw new SearchError('The search changed. Reload and try again.', 409);
    await audit(tx, {
      actorId: viewer.id,
      action: 'search.status',
      targetType: 'search',
      targetId: id,
      metadata: { from, to: status },
    });
  });

  let warning: string | undefined;
  let proposed: number | undefined;
  if (status === 'sourcing') {
    try {
      const result = await proposeMatchesForMandate(s.mandateId, {
        actorId: viewer.id,
        searchId: id,
      });
      proposed = result.proposed.length;
    } catch {
      warning =
        'Moved to sourcing, but matching could not run yet. Proposals will appear in match review once it does.';
    }
  }
  await notifyEmployer(s.companyId, id, s.title, `Your search is now at: ${statusLabel[status]}.`);
  return { id, status, warning, proposed };
}

/**
 * Record a placement for a revealed match (identity known, with the candidate's live consent) and
 * invoice the employer. AI-assisted search: one success-fee invoice. Fractional: the first month's
 * fee now; later months come from the monthly job.
 */
export async function placeSearch(viewer: Viewer | null, id: string, raw: unknown) {
  requireTalent(viewer);
  const input = placeInput.parse(raw);
  const s = await loadForChange(viewer, id);
  if (!s) throw new SearchError('Search not found.', 404);
  requireOwner(viewer, s);
  if (s.status !== 'shortlist' && s.status !== 'interviewing')
    throw new SearchError('Place a candidate from the shortlist or interview stage.', 409);

  const match = await asViewer(viewer, async (tx) => {
    const [m] = await tx
      .select({ id: matches.id, status: matches.status, mandateId: matches.mandateId })
      .from(matches)
      .where(eq(matches.id, input.matchId))
      .limit(1);
    return m ?? null;
  });
  if (!match || match.mandateId !== s.mandateId)
    throw new SearchError('That match is not part of this search.', 400);
  if (match.status !== 'revealed')
    throw new SearchError('Only a candidate who has revealed themselves can be placed.', 409);
  // The reveal consent must still stand (a withdrawn consent hides identity again).
  const [live] = await adminDb()
    .select({ id: revealRequests.id })
    .from(revealRequests)
    .innerJoin(consents, eq(consents.id, revealRequests.consentId))
    .where(
      and(
        eq(revealRequests.matchId, match.id),
        eq(revealRequests.candidateDecision, 'accepted'),
        isNull(consents.withdrawnAt),
      ),
    )
    .limit(1);
  if (!live) throw new SearchError('The candidate has withdrawn consent to be identified.', 409);

  const hiredAt = new Date();
  await asViewer(viewer, async (tx) => {
    const rows = await tx
      .update(searches)
      .set({
        status: 'placed',
        placedMatchId: match.id,
        hiredAt,
        placementComp: input.comp,
        placementCurrency: s.currency,
      })
      .where(and(eq(searches.id, id), inArray(searches.status, ['shortlist', 'interviewing'])))
      .returning({ id: searches.id });
    if (!rows.length) throw new SearchError('The search changed. Reload and try again.', 409);
    await audit(tx, {
      actorId: viewer.id,
      action: 'search.placed',
      targetType: 'search',
      targetId: id,
      metadata: { matchId: match.id, comp: input.comp, currency: s.currency, from: s.status },
    });
  });

  const invoice =
    (s.plan as SearchPlan) === 'ai_search'
      ? await issueSuccessFeeInvoice(id)
      : await issueFractionalInvoice(id, hiredAt);
  await notifyEmployer(
    s.companyId,
    id,
    s.title,
    'Your search is placed. An invoice is on its way.',
  );
  return { id, invoiceRef: invoice?.ref ?? null };
}
