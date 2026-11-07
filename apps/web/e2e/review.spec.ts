import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';
import { SESSION_COOKIE, signSession } from '../lib/session-token';

/**
 * Phase 3 acceptance: a confirmed mandate with three proposals (inserted as the Matcher would);
 * a talent partner approves two and rejects one; the employer sees exactly the two, anonymised,
 * and asks for both introductions; candidate 1 consents and candidate 2 declines; the employer
 * sees identity for candidate 1 only; they exchange messages; the audit log has every step.
 */

const db = () => postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

interface Setup {
  mandateId: string;
  title: string;
  matchIds: string[];
  candidates: { userId: string; name: string; email: string }[];
}

async function setup(): Promise<Setup> {
  const sql = db();
  try {
    const [{ company_id }] = await sql<[{ company_id: string }]>`
      select em.company_id from employer_members em join users u on u.id = em.user_id
      where u.email = 'employer@sample.cmobeat.dev' limit 1`;
    const title = `Chief Marketing Officer ${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const [{ id: mandateId }] = await sql<[{ id: string }]>`
      insert into mandates (company_id, source, title, level, scope, reporting_line, team_size,
        priorities, comp_min, comp_max, currency, comp_basis, work_type, market, confirmed_at)
      values (${company_id}, 'builder', ${title}, 'cmo',
        'Own brand, demand and product marketing through the move upmarket.', 'CEO', 24,
        ${sql.json(['Reposition for the mid-market', 'Double marketing-sourced pipeline'])},
        380000, 450000, 'USD', 'annual', 'full_time', 'US', now())
      returning id`;
    const cands = await sql<{ profile_id: string; user_id: string; name: string; email: string }[]>`
      select p.id as profile_id, u.id as user_id, u.display_name as name, u.email
      from candidate_profiles p join users u on u.id = p.user_id
      where p.visibility <> 'hidden' and p.deleted_at is null and u.deleted_at is null
        and not exists (select 1 from profile_blocklist b
                        where b.profile_id = p.id and b.company_id = ${company_id})
      order by random() limit 3`;
    const matchIds: string[] = [];
    for (const [i, c] of cands.entries()) {
      const [{ id }] = await sql<[{ id: string }]>`
        insert into matches (mandate_id, profile_id, score_low, score_high, rationale)
        values (${mandateId}, ${c.profile_id}, ${(62 + i) / 100}, ${(80 + i) / 100}, ${sql.json({
          summary: `Rebuilt demand at a comparable stage, with metrics (${i + 1}).`,
          reasons: [
            { reason: 'Took sourced pipeline from 18% to 46%.', direction: 'for' },
            { reason: 'Built a demand team of 30.', direction: 'for' },
            { reason: 'No direct experience reporting to a founder-CEO.', direction: 'against' },
          ],
        })})
        returning id`;
      await sql`insert into audit_log (actor_id, action, target_type, target_id, metadata)
                values (null, 'match.propose', 'match', ${id}, ${sql.json({ source: 'e2e' })})`;
      matchIds.push(id);
    }
    return {
      mandateId,
      title,
      matchIds,
      candidates: cands.map((c) => ({ userId: c.user_id, name: c.name, email: c.email })),
    };
  } finally {
    await sql.end();
  }
}

async function signInAs(page: Page, email: string) {
  await page.context().clearCookies({ name: SESSION_COOKIE });
  await page.goto('/sign-in');
  await page
    .locator('form', { has: page.locator(`input[value="${email}"]`) })
    .getByRole('button')
    .click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

/** Seeded candidates have no dev sign-in button; sign a session cookie with the local secret. */
async function signInAsUser(page: Page, userId: string) {
  const token = await signSession(
    { uid: userId, roles: ['reader', 'candidate'], exp: Math.floor(Date.now() / 1000) + 3600 },
    process.env.DEV_AUTH_SECRET!,
  );
  const url = new URL(page.url() === 'about:blank' ? 'http://localhost' : page.url());
  await page.context().clearCookies({ name: SESSION_COOKIE });
  await page
    .context()
    .addCookies([{ name: SESSION_COOKIE, value: token, domain: url.hostname, path: '/' }]);
}

async function expectAccessible(page: Page) {
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
}

test('approve two, reveal one with consent, message, and audit every step', async ({ page }) => {
  test.setTimeout(180_000);
  const s = await setup();
  const [m1, m2, m3] = s.matchIds as [string, string, string];
  const [c1, c2] = s.candidates;

  // 1. A talent partner reviews: approve two, reject one.
  await signInAs(page, 'talent@sample.cmobeat.dev');
  await page.goto('/console/matches');
  await expect(page.getByRole('heading', { level: 3, name: s.title })).toBeVisible();
  await expectAccessible(page);

  await page.goto(`/console/matches/${m1}`);
  await expect(page.getByText('Proposed by the Matcher')).toBeVisible();
  await expect(page.getByText(c1!.email)).toHaveCount(0);
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Approve match' }).click();
  await page.waitForURL(/\/console\/matches\?reviewed=approved/);

  await page.goto(`/console/matches/${m2}`);
  await page.getByRole('button', { name: 'Edit rationale' }).click();
  await page
    .getByLabel('Why it fits, in one or two sentences')
    .fill('Led a comparable repositioning; strong demand record.');
  await page.getByRole('button', { name: 'Save and approve' }).click();
  await page.waitForURL(/reviewed=approved/);

  await page.goto(`/console/matches/${m3}`);
  await page.getByLabel(/Note \(required to reject/).fill('Wants fractional work only.');
  await page.getByRole('button', { name: 'Reject' }).click();
  await page.waitForURL(/reviewed=rejected/);

  // 2. The employer sees exactly the two approved matches, anonymised, and asks for both.
  await signInAs(page, 'employer@sample.cmobeat.dev');
  await page.goto(`/employer/mandates/${s.mandateId}/shortlist`);
  const items = page.getByRole('listitem', { name: /^Candidate \d+$/ });
  await expect(items).toHaveCount(2);
  for (const c of s.candidates) await expect(page.getByText(c.email)).toHaveCount(0);
  await expect(page.getByText('Human review').first()).toBeVisible();
  await expectAccessible(page);
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Request introduction' }).first().click();
    // Wait for this request's own confirmation, not an earlier request's status.
    await expect(page.getByText(/Introduction requested/)).toHaveCount(i + 1);
  }
  await expect(page.getByText(/Introduction requested/)).toHaveCount(2);

  // 3. Candidate 1 consents through the Consent Gate.
  await signInAsUser(page, c1!.userId);
  await page.goto('/me/matches');
  const card1 = page.getByRole('listitem').filter({ hasText: s.title });
  await expect(card1).toContainText('company not named');
  await card1.getByRole('button', { name: 'Review the introduction' }).click();
  const gate = page.getByRole('dialog');
  await expect(gate).toContainText('Full name');
  const consent = gate.getByRole('button', { name: 'Introduce me' });
  await expect(consent).toBeDisabled();
  await expectAccessible(page);
  await gate.getByRole('checkbox').click();
  await consent.click();
  await expect(card1.getByText('Introduced')).toBeVisible();

  // 4. Candidate 2 declines.
  await signInAsUser(page, c2!.userId);
  await page.goto('/me/matches');
  const card2 = page.getByRole('listitem').filter({ hasText: s.title });
  await card2.getByRole('button', { name: 'Decline' }).click();
  await expect(card2.getByRole('button', { name: 'Review the introduction' })).toHaveCount(0);

  // 5. The employer sees identity for candidate 1 only, and writes.
  await signInAs(page, 'employer@sample.cmobeat.dev');
  await page.goto(`/employer/mandates/${s.mandateId}/shortlist`);
  await expect(page.getByText(c1!.email)).toBeVisible();
  await expect(page.getByText(c2!.email)).toHaveCount(0);
  await expect(page.getByText('The candidate chose not to be introduced')).toBeVisible();
  await page.getByRole('link', { name: /^Message / }).click();
  await page
    .getByLabel('Message', { exact: true })
    .fill('Thank you for agreeing. Could we speak on Thursday?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Could we speak on Thursday?')).toBeVisible();
  await expectAccessible(page);

  // 6. Candidate 1 reads it and replies.
  await signInAsUser(page, c1!.userId);
  await page.goto(`/me/matches/${m1}/messages`);
  await expect(page.getByText('Could we speak on Thursday?')).toBeVisible();
  await page.getByLabel('Message', { exact: true }).fill('Thursday at 10 works.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Thursday at 10 works.')).toBeVisible();

  // 7. Every step is in the audit log.
  const sql = db();
  try {
    const rows = await sql<{ action: string; target_id: string }[]>`
      select action, target_id from audit_log
      where target_type = 'match' and target_id in ${sql(s.matchIds)}`;
    const count = (a: string, id?: string) =>
      rows.filter((r) => r.action === a && (!id || r.target_id === id)).length;
    expect(count('match.propose')).toBe(3);
    expect(count('match.approve')).toBe(2);
    expect(count('match.rationale_edit', m2)).toBe(1);
    expect(count('match.reject', m3)).toBe(1);
    expect(count('reveal.request')).toBe(2);
    expect(count('reveal.consent', m1)).toBe(1);
    expect(count('reveal.decline', m2)).toBe(1);
    expect(count('message.send', m1)).toBe(2);
  } finally {
    await sql.end();
  }
});

test('a candidate cannot reach staff review, and an employer cannot see another company’s shortlist', async ({
  page,
}) => {
  await signInAs(page, 'candidate@sample.cmobeat.dev');
  await page.goto('/console/matches');
  await expect(page).not.toHaveURL(/\/console\/matches/);
  const res = await page.request.get('/api/matches/00000000-0000-4000-8000-000000000001');
  expect([401, 403, 404]).toContain(res.status());
  await signInAs(page, 'employer@sample.cmobeat.dev');
  const other = await page.request.get('/api/matches?mandate=00000000-0000-4000-8000-0000000000ff');
  expect(other.status()).toBe(404);
});
