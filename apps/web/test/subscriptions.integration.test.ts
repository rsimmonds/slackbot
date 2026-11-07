import { randomBytes } from 'node:crypto';
import {
  adminDb,
  coachingRequests,
  consents,
  employerInvites,
  employerMembers,
  listings,
  payments,
  subscriptions,
  userRoles,
  withUser,
} from '@cmobeat/db';
import { devUsers } from '@cmobeat/db/dev-users';
import { latestEmailTo } from '@cmobeat/email';
import {
  buildFakeInvoicePaymentFailed,
  buildFakeSubscriptionDeleted,
  buildFakeSubscriptionInvoicePaid,
  buildFakeSubscriptionUpdated,
  fakePaymentsSecret,
  type FakeSubscriptionState,
} from '@cmobeat/payments';
import { and, eq, like, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as cancelRoute } from '@/app/api/billing/subscriptions/cancel/route';
import { POST as subscribeRoute } from '@/app/api/billing/subscriptions/route';
import { POST as portalRoute } from '@/app/api/billing/portal/route';
import { POST as webhookRoute } from '@/app/api/billing/webhook/route';
import {
  DELETE as cancelCoachingRoute,
  POST as coachingActionRoute,
} from '@/app/api/concierge/coaching/[id]/route';
import {
  GET as coachingListRoute,
  POST as coachingRoute,
} from '@/app/api/concierge/coaching/route';
import { POST as submitRoute } from '@/app/api/listings/[id]/submit/route';
import { POST as digestRoute } from '@/app/api/me/digest/route';
import { POST as acceptRoute } from '@/app/api/team/invites/accept/route';
import { DELETE as revokeRoute } from '@/app/api/team/invites/[id]/route';
import { POST as inviteRoute } from '@/app/api/team/invites/route';
import { DELETE as removeRoute } from '@/app/api/team/members/[id]/route';
import { GET as teamRoute } from '@/app/api/team/route';
import { runCareerDigests } from '@/lib/billing/digest';
import { hasActiveEmployerSubscription } from '@/lib/billing/subscriptions';
import { createDraftFromParse, saveMandate, type MandateInput } from '@/lib/jobs/posting';
import { decideListing as moderateListing } from '@/lib/jobs/moderation';
import { JD, jsonRequest, signInAs } from './helpers';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const secret = () => fakePaymentsSecret();
const dev = (who: string) => devUsers.find((d) => d.email === `${who}@sample.cmobeat.dev`)!;
const ref = () => `fake_sub_test${randomBytes(6).toString('hex')}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route bodies vary per test
const json = async (res: Response) => (await res.json()) as { data?: any; error?: string };

async function deliver(signed: { body: string; headers: Record<string, string> }) {
  return webhookRoute(
    new Request('http://localhost:3000/api/billing/webhook', {
      method: 'POST',
      body: signed.body,
      headers: signed.headers,
    }),
  );
}

let companyId: string;
const subRefs: string[] = [];

function state(over: Partial<FakeSubscriptionState>): FakeSubscriptionState {
  return {
    subscriptionRef: ref(),
    customerId: 'fake_cus_test',
    product: 'employer_subscription',
    companyId,
    userId: null,
    status: 'active',
    seats: 5,
    currentPeriodEnd: new Date(Date.now() + 30 * 864e5).toISOString(),
    cancelAtPeriodEnd: false,
    ...over,
  };
}

async function subscribeEmployer(over: Partial<FakeSubscriptionState> = {}) {
  const s = state(over);
  subRefs.push(s.subscriptionRef);
  const res = await deliver(buildFakeSubscriptionUpdated(s, secret()));
  return { s, res };
}

const mandate: MandateInput = {
  title: 'Chief Marketing Officer',
  level: 'cmo',
  scope: 'Owns brand, demand and product marketing.',
  reportingLine: 'CEO',
  teamSize: 20,
  priorities: ['Reposition the brand', 'Build a demand engine', 'Hire a head of PMM'],
  compMin: 400000,
  compMax: 480000,
  currency: 'USD',
  compBasis: 'annual',
  workType: 'full_time',
  location: 'New York',
  remote: false,
  market: 'US',
};

async function confirmedListing() {
  const employer = signInAs('employer')!;
  const draft = await createDraftFromParse(employer as never, { text: JD });
  await saveMandate(employer as never, draft.listingId, mandate, true);
  return draft.listingId;
}

beforeAll(async () => {
  const [m] = await adminDb()
    .select({ companyId: employerMembers.companyId })
    .from(employerMembers)
    .where(eq(employerMembers.userId, dev('employer').id));
  companyId = m!.companyId;
});

afterAll(async () => {
  const db = adminDb();
  const reader = dev('reader').id;
  await db.delete(employerMembers).where(eq(employerMembers.userId, reader));
  await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, reader), eq(userRoles.role, 'employer')));
  await db.delete(employerInvites).where(eq(employerInvites.companyId, companyId));
  await db.delete(coachingRequests);
  await db.delete(payments).where(like(payments.product, '%subscription%'));
  await db.delete(payments).where(eq(payments.product, 'candidate_concierge'));
  await db.delete(subscriptions);
  await db
    .update(consents)
    .set({ withdrawnAt: new Date() })
    .where(sql`${consents.scope}->>'purpose' = 'career_digest'`);
});

describe('subscription checkout', () => {
  it('starts a TEST checkout for owners, and only for the right roles', async () => {
    signInAs('employer');
    const res = await subscribeRoute(
      jsonRequest('/api/billing/subscriptions', 'POST', { product: 'employer_subscription' }),
    );
    expect(res.status).toBe(200);
    const url = new URL((await json(res)).data.url);
    expect(url.pathname).toBe('/checkout/fake/subscription');
    expect(url.searchParams.get('t')).toBeTruthy();

    signInAs('reader');
    expect(
      (
        await subscribeRoute(
          jsonRequest('/api/billing/subscriptions', 'POST', { product: 'employer_subscription' }),
        )
      ).status,
    ).toBe(403);
    signInAs('employer');
    expect(
      (
        await subscribeRoute(
          jsonRequest('/api/billing/subscriptions', 'POST', { product: 'candidate_concierge' }),
        )
      ).status,
    ).toBe(403);
    signInAs('candidate');
    expect(
      (
        await subscribeRoute(
          jsonRequest('/api/billing/subscriptions', 'POST', { product: 'candidate_concierge' }),
        )
      ).status,
    ).toBe(200);
    signInAs(null);
    expect(
      (
        await subscribeRoute(
          jsonRequest('/api/billing/subscriptions', 'POST', { product: 'candidate_concierge' }),
        )
      ).status,
    ).toBe(401);
    signInAs('employer');
    expect(
      (await subscribeRoute(jsonRequest('/api/billing/subscriptions', 'POST', { product: 'nope' })))
        .status,
    ).toBe(400);
  });
});

describe('subscription posts without a subscription', () => {
  it('refuses plan "subscription", in the app and in the database', async () => {
    const id = await confirmedListing();
    const res = await submitRoute(
      jsonRequest(`/api/listings/${id}/submit`, 'POST', { plan: 'subscription' }),
      ctx(id),
    );
    expect(res.status).toBe(402);
    const [l] = await adminDb().select().from(listings).where(eq(listings.id, id));
    expect(l!.status).toBe('draft');
    // Second wall: even a direct update under RLS cannot put it into review.
    const employer = dev('employer');
    await expect(
      withUser({ userId: employer.id, roles: ['employer'] }, (tx) =>
        tx
          .update(listings)
          .set({ plan: 'subscription', status: 'pending_review' })
          .where(eq(listings.id, id)),
      ),
    ).rejects.toThrow();
  });
});

describe('subscription webhook', () => {
  it('stores the subscription, ignores replays, and records paid periods once', async () => {
    const s = state({});
    subRefs.push(s.subscriptionRef);
    const signed = buildFakeSubscriptionUpdated(s, secret());
    const first = await deliver(signed);
    expect((await first.json()).outcome).toBe('created');
    expect((await (await deliver(signed)).json()).outcome).toBe('duplicate');
    expect(await hasActiveEmployerSubscription(companyId)).toBe(true);
    expect((await latestEmailTo(dev('employer').email))!.template).toBe('subscription-started');

    const paid = buildFakeSubscriptionInvoicePaid(
      { subscriptionRef: s.subscriptionRef, product: 'employer_subscription' },
      secret(),
    );
    expect((await (await deliver(paid)).json()).outcome).toBe('paid');
    expect((await (await deliver(paid)).json()).outcome).toBe('duplicate');
    const rows = await adminDb()
      .select()
      .from(payments)
      .where(and(eq(payments.companyId, companyId), eq(payments.product, 'employer_subscription')));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe(150_000);

    // A second active subscription can't be started.
    signInAs('employer');
    expect(
      (
        await subscribeRoute(
          jsonRequest('/api/billing/subscriptions', 'POST', { product: 'employer_subscription' }),
        )
      ).status,
    ).toBe(409);
  });

  it('asks the provider to retry an invoice for an unknown subscription, and rejects forgeries', async () => {
    const early = buildFakeSubscriptionInvoicePaid(
      { subscriptionRef: ref(), product: 'employer_subscription' },
      secret(),
    );
    expect((await deliver(early)).status).toBe(409);
    const forged = buildFakeSubscriptionUpdated(state({}), 'f'.repeat(48));
    expect((await deliver(forged)).status).toBe(400);
  });

  it('refuses unknown owners and an owner change on an existing subscription', async () => {
    const nobody = await deliver(
      buildFakeSubscriptionUpdated(
        state({ companyId: '00000000-0000-4000-8000-00000000abcd' }),
        secret(),
      ),
    );
    expect((await nobody.json()).outcome).toBe('mismatch');
    const { s } = await subscribeEmployer();
    const hijack = buildFakeSubscriptionUpdated(
      { ...s, product: 'candidate_concierge', companyId: null, userId: dev('candidate').id },
      secret(),
    );
    expect((await (await deliver(hijack)).json()).outcome).toBe('mismatch');
  });

  it('marks a failed payment past_due (still active), and a deletion ends it', async () => {
    const { s } = await subscribeEmployer();
    expect(
      (await (await deliver(buildFakeInvoicePaymentFailed(s.subscriptionRef, secret()))).json())
        .outcome,
    ).toBe('payment_failed');
    const [row] = await adminDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, s.subscriptionRef));
    expect(row!.status).toBe('past_due');
    expect(
      (await (await deliver(buildFakeSubscriptionDeleted(s.subscriptionRef, secret()))).json())
        .outcome,
    ).toBe('ended');
  });

  it('opens the TEST portal; the fake provider changes cancellation only there', async () => {
    signInAs('employer');
    const portal = await portalRoute(
      jsonRequest('/api/billing/portal', 'POST', { product: 'employer_subscription' }),
    );
    expect(new URL((await json(portal)).data.url).pathname).toBe('/billing/portal/fake');
    const cancel = await json(
      await cancelRoute(
        jsonRequest('/api/billing/subscriptions/cancel', 'POST', {
          product: 'employer_subscription',
          cancel: true,
        }),
      ),
    );
    expect(cancel.data.applied).toBe(false);
    expect(new URL(cancel.data.url).pathname).toBe('/billing/portal/fake');
    signInAs('candidate');
    expect(
      (
        await portalRoute(
          jsonRequest('/api/billing/portal', 'POST', { product: 'employer_subscription' }),
        )
      ).status,
    ).toBe(403);
  });
});

describe('unlimited posts while subscribed', () => {
  it('submits without checkout, staff approve it, and approval stops once the subscription ends', async () => {
    const { s } = await subscribeEmployer();
    const id = await confirmedListing();
    const res = await submitRoute(
      jsonRequest(`/api/listings/${id}/submit`, 'POST', { plan: 'subscription' }),
      ctx(id),
    );
    expect(await res.json()).toEqual({ kind: 'submitted' });
    const [l] = await adminDb().select().from(listings).where(eq(listings.id, id));
    expect(l).toMatchObject({
      status: 'pending_review',
      plan: 'subscription',
      paidAt: null,
      checkoutRef: null,
    });

    const id2 = await confirmedListing();
    await submitRoute(
      jsonRequest(`/api/listings/${id2}/submit`, 'POST', { plan: 'subscription' }),
      ctx(id2),
    );

    const editor = signInAs('editor')!;
    await moderateListing(editor as never, id, { decision: 'approve' } as never);
    const [live] = await adminDb().select().from(listings).where(eq(listings.id, id));
    expect(live!.status).toBe('live');

    // End every employer subscription for the company; the pending one can no longer be approved.
    for (const r of subRefs) await deliver(buildFakeSubscriptionDeleted(r, secret()));
    await deliver(buildFakeSubscriptionDeleted(s.subscriptionRef, secret()));
    expect(await hasActiveEmployerSubscription(companyId)).toBe(false);
    await expect(
      moderateListing(editor as never, id2, { decision: 'approve' } as never),
    ).rejects.toThrow(/no longer active/);
  });
});

describe('team and seats', () => {
  it('invites within the free seat limit, never stores the token, and accepts only for the invited email', async () => {
    signInAs('employer');
    const before = await json(await teamRoute());
    expect(before.data.limit).toBe(3);
    const res = await inviteRoute(
      jsonRequest('/api/team/invites', 'POST', { email: dev('reader').email }),
    );
    expect(res.status).toBe(201);
    const mail = (await latestEmailTo(dev('reader').email))!;
    expect(mail.template).toBe('seat-invite');
    const token = String((mail.payload as { html: string }).html).match(
      /\/invite\/([A-Za-z0-9_-]{43})/,
    )![1]!;
    const [inv] = await adminDb()
      .select()
      .from(employerInvites)
      .where(eq(employerInvites.email, dev('reader').email));
    expect(inv!.tokenHash).not.toContain(token);
    expect(JSON.stringify(mail.payload).match(new RegExp(`"inviteId"`))).toBeTruthy();

    // Duplicate invite, wrong account, and a non-admin inviter are all refused.
    expect(
      (await inviteRoute(jsonRequest('/api/team/invites', 'POST', { email: dev('reader').email })))
        .status,
    ).toBe(409);
    signInAs('candidate');
    expect(
      (await acceptRoute(jsonRequest('/api/team/invites/accept', 'POST', { token }))).status,
    ).toBe(403);
    signInAs('reader');
    const ok = await acceptRoute(jsonRequest('/api/team/invites/accept', 'POST', { token }));
    expect(ok.status).toBe(200);
    expect((await json(ok)).data.companyId).toBe(companyId);
    expect(
      (await acceptRoute(jsonRequest('/api/team/invites/accept', 'POST', { token }))).status,
    ).toBe(410);

    // The new member sees the team but cannot invite.
    const asMember = { ...signInAs('reader')!, roles: ['reader', 'employer'] as const };
    const { testAuth } = await import('./setup');
    testAuth.viewer = { ...asMember, roles: [...asMember.roles] };
    const team = await json(await teamRoute());
    expect(team.data.members.map((m: { email: string }) => m.email)).toEqual(
      expect.arrayContaining([dev('employer').email, dev('reader').email]),
    );
    expect(team.data.canManage).toBe(false);
    expect(
      (await inviteRoute(jsonRequest('/api/team/invites', 'POST', { email: 'x@example.com' })))
        .status,
    ).toBe(403);
  });

  it('stops at the seat limit, revokes, removes members, and keeps the last owner', async () => {
    signInAs('employer');
    // 2 members now; one more pending invite fills the 3 free seats.
    const r1 = await inviteRoute(
      jsonRequest('/api/team/invites', 'POST', { email: 'seat3@example.com' }),
    );
    expect(r1.status).toBe(201);
    expect(
      (await inviteRoute(jsonRequest('/api/team/invites', 'POST', { email: 'seat4@example.com' })))
        .status,
    ).toBe(409);
    const inviteId = (await json(r1)).data.inviteId;
    expect((await revokeRoute(new Request('http://x'), ctx(inviteId))).status).toBe(200);

    const team = (await json(await teamRoute())).data;
    const me = team.members.find((m: { email: string }) => m.email === dev('employer').email);
    const reader = team.members.find((m: { email: string }) => m.email === dev('reader').email);
    expect((await removeRoute(new Request('http://x'), ctx(me.memberId))).status).toBe(409); // not yourself
    expect((await removeRoute(new Request('http://x'), ctx(reader.memberId))).status).toBe(200);
    // With no seats left, the person is no longer an employer.
    const roles = await adminDb()
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, dev('reader').id));
    expect(roles.map((r) => r.role)).not.toContain('employer');

    // The database refuses to remove the last owner, whoever asks.
    await expect(
      adminDb().delete(employerMembers).where(eq(employerMembers.id, me.memberId)),
    ).rejects.toThrow();
  });
});

describe('concierge', () => {
  it('needs an active concierge subscription to request coaching; topics are encrypted', async () => {
    signInAs('candidate');
    expect(
      (
        await coachingRoute(
          jsonRequest('/api/concierge/coaching', 'POST', {
            topic: 'Preparing for a board interview next month.',
          }),
        )
      ).status,
    ).toBe(402);
    const s = state({
      product: 'candidate_concierge',
      companyId: null,
      userId: dev('candidate').id,
      seats: 1,
    });
    expect((await (await deliver(buildFakeSubscriptionUpdated(s, secret()))).json()).outcome).toBe(
      'created',
    );

    const res = await coachingRoute(
      jsonRequest('/api/concierge/coaching', 'POST', {
        topic: 'Preparing for a board interview next month.',
      }),
    );
    expect(res.status).toBe(201);
    const id = (await json(res)).data.id;
    const [raw] = await adminDb()
      .select()
      .from(coachingRequests)
      .where(eq(coachingRequests.id, id));
    expect(raw!.topic.toString('utf8')).not.toContain('board interview');
    expect((await latestEmailTo(dev('talent').email))!.template).toBe('coaching-requested');

    // Talent partner: sees the topic, refuses a past time, schedules, marks done.
    signInAs('talent');
    const queue = await json(await coachingListRoute());
    expect(queue.data.find((q: { id: string }) => q.id === id).topic).toContain('board interview');
    expect(
      (await coachingActionRoute(jsonRequest('/x', 'POST', { action: 'done' }), ctx(id))).status,
    ).toBe(409);
    expect(
      (
        await coachingActionRoute(
          jsonRequest('/x', 'POST', { action: 'schedule', at: '2020-01-01T10:00:00Z' }),
          ctx(id),
        )
      ).status,
    ).toBe(400);
    const at = new Date(Date.now() + 3 * 864e5).toISOString();
    expect(
      (await coachingActionRoute(jsonRequest('/x', 'POST', { action: 'schedule', at }), ctx(id)))
        .status,
    ).toBe(200);
    expect((await latestEmailTo(dev('candidate').email))!.template).toBe('coaching-scheduled');
    expect(
      (await coachingActionRoute(jsonRequest('/x', 'POST', { action: 'done' }), ctx(id))).status,
    ).toBe(200);

    // Others: an employer can't read the queue or act; a candidate can't schedule.
    signInAs('employer');
    expect((await coachingListRoute()).status).toBe(403);
    expect(
      (await coachingActionRoute(jsonRequest('/x', 'POST', { action: 'take' }), ctx(id))).status,
    ).toBe(403);
    signInAs('candidate');
    expect(
      (await coachingActionRoute(jsonRequest('/x', 'POST', { action: 'take' }), ctx(id))).status,
    ).toBe(403);
  });

  it('lets the candidate cancel their own request only', async () => {
    signInAs('candidate');
    const id = (
      await json(
        await coachingRoute(
          jsonRequest('/api/concierge/coaching', 'POST', {
            topic: 'Negotiating equity for a CMO offer.',
          }),
        ),
      )
    ).data.id;
    signInAs('reader');
    expect((await cancelCoachingRoute(new Request('http://x'), ctx(id))).status).toBe(403);
    signInAs('candidate');
    expect((await cancelCoachingRoute(new Request('http://x'), ctx(id))).status).toBe(200);
  });
});

describe('career digest', () => {
  it('is opt-in, sent at most once a week, and stops when turned off', async () => {
    signInAs('candidate');
    expect((await digestRoute(jsonRequest('/api/me/digest', 'POST', { on: true }))).status).toBe(
      200,
    );
    const now = new Date();
    const first = await runCareerDigests({ now });
    expect(first.sent).toBeGreaterThanOrEqual(1);
    const mail = (await latestEmailTo(dev('candidate').email))!;
    expect(mail.template).toBe('career-digest');
    const second = await runCareerDigests({ now });
    expect(second.sent).toBe(0);
    expect(second.skipped).toBeGreaterThanOrEqual(1);

    expect((await digestRoute(jsonRequest('/api/me/digest', 'POST', { on: false }))).status).toBe(
      200,
    );
    const nextWeek = await runCareerDigests({ now: new Date(now.getTime() + 7 * 864e5) });
    expect(nextWeek.sent).toBe(0);

    signInAs('employer');
    expect((await digestRoute(jsonRequest('/api/me/digest', 'POST', { on: true }))).status).toBe(
      403,
    );
  });
});
