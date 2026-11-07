import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';
import { SESSION_COOKIE, signSession } from '../lib/session-token';

/**
 * Phase 4 (subscriptions): an employer subscribes (test checkout), posts a job under the plan
 * without paying, invites a teammate who accepts with their own email; a candidate subscribes to
 * concierge, asks for coaching, and a talent partner schedules it. Flows that change shared state
 * run on desktop only and clean up after themselves; every page is checked on mobile too.
 */
if (!process.env.DATABASE_URL && existsSync('../../.env')) process.loadEnvFile('../../.env');

async function db<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page
    .locator('form', { has: page.locator(`input[value="${email}"]`) })
    .getByRole('button')
    .click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

/** Sign in as a user who is not on the dev sign-in screen (created by the test). */
async function signInAsUser(page: Page, userId: string) {
  await page.context().clearCookies();
  const token = await signSession(
    { uid: userId, roles: ['reader'], exp: Math.floor(Date.now() / 1000) + 3600 },
    process.env.DEV_AUTH_SECRET!,
  );
  const url = new URL(page.url() === 'about:blank' ? 'http://localhost' : page.url());
  await page
    .context()
    .addCookies([{ name: SESSION_COOKIE, value: token, domain: url.hostname, path: '/' }]);
}

async function expectAccessible(page: Page) {
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

/** End a subscription from the TEST portal, so other tests see the unsubscribed state. */
async function endFromPortal(page: Page, from: string) {
  await page.goto(from);
  const manage = page.getByRole('button', { name: 'Manage subscription' });
  if (!(await manage.isVisible())) return;
  await manage.click();
  await page.waitForURL(/\/billing\/portal\/fake/);
  await page.getByRole('button', { name: 'End now' }).click();
  await expect(page.getByText('Ended', { exact: true })).toBeVisible();
}

test('an employer subscribes, posts under the plan, and a teammate joins', async ({
  page,
  isMobile,
}, info) => {
  test.skip(isMobile, 'changes shared state; pages are checked on mobile below');
  test.slow();
  const stamp = `${info.project.name}${Date.now().toString(36)}`;
  const title = `Chief Marketing Officer Halcyon${stamp}`;

  // 1. Subscribe on the TEST checkout.
  await signInAs(page, 'employer@sample.cmobeat.dev');
  await page.goto('/employer/billing');
  await endFromPortal(page, '/employer/billing'); // from an earlier, interrupted run
  await expectAccessible(page);
  await page.getByRole('button', { name: /^Subscribe · \$1,500\.00 \/ month/ }).click();
  await page.waitForURL(/\/checkout\/fake\/subscription\?t=/);
  await expect(page.getByText('Test mode · no card is charged')).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: /^Subscribe for \$1,500\.00 \/ month \(test\)/ }).click();
  await page.waitForURL(/\/employer\/billing\?subscribed=1/);
  await expect(page.getByText(/Subscribed\. Unlimited posts are on/)).toBeVisible();
  await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();

  // 2. Post a job under the plan: no checkout.
  await page.goto('/employer/jobs/new');
  await page.getByLabel('Job description').fill(`${title}
Reports to the CEO. Team of 30.
Base $400,000 - $480,000
- Reposition the brand for the mid-market
- Build a demand engine the board trusts
- Hire a head of product marketing`);
  await page.getByRole('button', { name: 'Read this description' }).click();
  await page.waitForURL(/\/employer\/jobs\/[0-9a-f-]+\/edit\?parsed=1/);
  await page.getByLabel('Scope').fill('Owns brand, demand and product marketing.');
  await page.getByRole('button', { name: 'Confirm mandate' }).click();
  await page.waitForURL(/confirmed=1/);
  await page.getByRole('radio', { name: /Included in your subscription/ }).check();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await page.waitForURL(/\/employer\/jobs\?submitted=/);
  await expect(page.getByText(/Submitted under your subscription/)).toBeVisible();
  await expect(page.locator('tr', { hasText: title }).getByText('With our editors')).toBeVisible();

  // 3. Invite a teammate (a fresh account, so no other test's user changes role).
  const teammateId = randomUUID();
  const email = `teammate.${stamp}@example.com`;
  await db(async (sql) => {
    await sql`insert into users (id, email, display_name, is_sample) values (${teammateId}, ${email}, ${'Taylor Teammate'}, true)`;
    await sql`insert into user_roles (user_id, role) values (${teammateId}, 'reader')`;
  });
  await page.goto('/employer/team');
  await expectAccessible(page);
  await page.getByLabel('Work email').fill(email);
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Pending invitations' })).toContainText(email);
  const link = await db(async (sql) => {
    const [row] =
      await sql`select payload->>'html' as html from email_outbox where to_email = ${email} order by created_at desc limit 1`;
    return (row!.html as string).match(/https?:\/\/[^"\s]+\/invite\/[A-Za-z0-9_-]{43}/)![0];
  });
  const path = new URL(link).pathname;

  // 4. The teammate accepts with their own account.
  await signInAsUser(page, teammateId);
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Join');
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Accept and join the team' }).click();
  await page.waitForURL(/\/employer\/team\?joined=1/);
  await expect(page.getByRole('list', { name: 'Team members' })).toContainText('Taylor Teammate');
  await expect(page.getByText('Owners and admins invite teammates.')).toBeVisible();

  // 5. Clean up: the owner removes the teammate and ends the subscription.
  await signInAs(page, 'employer@sample.cmobeat.dev');
  await page.goto('/employer/team');
  await page.getByRole('button', { name: 'Remove Taylor Teammate' }).click();
  await expect(page.getByRole('list', { name: 'Team members' })).not.toContainText(
    'Taylor Teammate',
  );
  await endFromPortal(page, '/employer/billing');
});

test('a candidate subscribes to concierge, asks for coaching, and a talent partner schedules it', async ({
  page,
  isMobile,
}, info) => {
  test.skip(isMobile, 'changes shared state; pages are checked on mobile below');
  test.slow();
  const topic = `Preparing for a board interview ${info.project.name}${Date.now().toString(36)}`;

  await signInAs(page, 'candidate@sample.cmobeat.dev');
  await endFromPortal(page, '/me/concierge');
  await page.goto('/me/concierge');
  await expectAccessible(page);
  await page.getByRole('button', { name: /^Subscribe · \$99\.00 \/ month/ }).click();
  await page.waitForURL(/\/checkout\/fake\/subscription\?t=/);
  await page.getByRole('button', { name: /^Subscribe for \$99\.00 \/ month \(test\)/ }).click();
  await page.waitForURL(/\/me\/concierge\?subscribed=1/);
  await expect(page.getByText('Concierge is active.', { exact: false })).toBeVisible();

  await page.getByLabel('What would you like help with?').fill(topic);
  await page.getByRole('button', { name: 'Request a coaching session' }).click();
  await expect(page.getByText('Requested. A talent partner will propose a time.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Coaching requests' })).toContainText(topic);

  await signInAs(page, 'talent@sample.cmobeat.dev');
  await page.goto('/console/coaching');
  await expectAccessible(page);
  const item = page.getByRole('listitem').filter({ hasText: topic });
  const when = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 16);
  await item.getByLabel('Session time, UTC').fill(when);
  await item.getByRole('button', { name: 'Schedule' }).click();
  await expect(item.getByText('Scheduled. The candidate has been emailed.')).toBeVisible();

  await signInAs(page, 'candidate@sample.cmobeat.dev');
  await page.goto('/me/concierge');
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: topic })
      .getByText(/^Scheduled ·/),
  ).toBeVisible();
  await endFromPortal(page, '/me/concierge');
});

test('the new pages render and are accessible on every device', async ({ page }) => {
  await signInAs(page, 'employer@sample.cmobeat.dev');
  for (const path of ['/employer/billing', '/employer/team']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectAccessible(page);
  }
  await signInAs(page, 'candidate@sample.cmobeat.dev');
  await page.goto('/me/concierge');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectAccessible(page);
  await page.goto('/me');
  await expect(page.getByRole('region', { name: 'Career digest' })).toBeVisible();
  await expectAccessible(page);
  await signInAs(page, 'talent@sample.cmobeat.dev');
  await page.goto('/console/coaching');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectAccessible(page);
});

test('an invalid invitation link explains itself', async ({ page }) => {
  await page.goto(`/invite/${'x'.repeat(43)}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'This invitation can’t be used.',
  );
  await expectAccessible(page);
});
