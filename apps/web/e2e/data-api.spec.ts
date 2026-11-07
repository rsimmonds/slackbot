import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

/**
 * Phase 4 acceptance: a subscriber pulls a moves dataset through the API.
 * An employer with an active subscription creates a key in the UI, copies it from the one-time
 * reveal, and calls /api/v1/moves with it. A revoked key gets 401. Without a subscription,
 * no key can be created.
 */

const EMPLOYER = 'employer@sample.cmobeat.dev';
const db = () => postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

async function employerCompany(): Promise<string> {
  const sql = db();
  try {
    const [r] = await sql<{ company_id: string }[]>`
      select em.company_id from employer_members em join users u on u.id = em.user_id
      where u.email = ${EMPLOYER} limit 1`;
    return r!.company_id;
  } finally {
    await sql.end();
  }
}

/** Set the company's subscription the way the billing webhook would. */
async function setSubscription(active: boolean) {
  const companyId = await employerCompany();
  const sql = db();
  try {
    await sql`delete from subscriptions where company_id = ${companyId}`;
    if (active)
      await sql`insert into subscriptions (company_id, stripe_customer_id, stripe_subscription_id, product, stripe_price_id, status, seats)
        values (${companyId}, 'cus_e2e', ${`sub_e2e_${Date.now()}`}, 'employer_subscription', 'price_e2e', 'active', 3)`;
  } finally {
    await sql.end();
  }
}

async function signInAs(page: Page, email: string) {
  await page.goto('/sign-in');
  await page
    .locator('form', { has: page.locator(`input[value="${email}"]`) })
    .getByRole('button')
    .click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

async function expectAccessible(page: Page) {
  await page.waitForTimeout(700);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
}

test.describe('data API (subscription state is shared, so run once, in order)', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'changes the shared subscription; desktop only');

  test('without a subscription, no key can be created', async ({ page }) => {
    await setSubscription(false);
    await signInAs(page, EMPLOYER);
    await page.goto('/employer/api');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'The data API comes with the employer subscription.',
    );
    await expect(page.getByRole('button', { name: 'Create key' })).toHaveCount(0);
    await expectAccessible(page);
  });

  test('a subscriber creates a key, pulls moves with it, then revokes it', async ({
    page,
    request,
  }) => {
    await setSubscription(true);
    await signInAs(page, EMPLOYER);
    await page.goto('/employer/api');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Data API');
    await expectAccessible(page);

    const name = `E2E ${Date.now()}`;
    await page.getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Create key' }).click();
    const reveal = page.getByTestId('new-api-key');
    await expect(reveal).toBeVisible();
    const key = (await reveal.textContent())!.trim();
    expect(key).toMatch(/^cmob_live_[0-9A-Za-z]{32}$/);
    await expect(page.getByText('This is the only time it is shown.')).toBeVisible();

    // The acceptance: pull the moves dataset through the API.
    const res = await request.get('/api/v1/moves?limit=50', {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]).toMatchObject({ person: expect.any(String), sources: expect.any(Array) });
    expect(res.headers()['x-ratelimit-limit']).toBeTruthy();

    // Revoke in the UI; the next call is refused.
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: `Revoke ${name}` }).click();
    await expect(page.getByText(/^Revoked /).first()).toBeVisible();
    const after = await request.get('/api/v1/moves', {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(after.status()).toBe(401);
    expect((await after.json()).error.code).toBe('revoked_key');

    // Exports for subscribers.
    await page.goto('/employer/data');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Data exports');
    const csv = await page.request.get('/employer/data/export?dataset=moves&format=csv');
    expect(csv.status()).toBe(200);
    expect((await csv.text()).split('\r\n')[0]).toMatch(/^# CMO Beat moves dataset/);
    await expectAccessible(page);
  });
});

test('the developer docs are public, accessible and link the OpenAPI document', async ({
  page,
  request,
}) => {
  await page.goto('/developers');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The data, in your own tools.');
  await expect(page.getByRole('link', { name: 'OpenAPI 3.1 document' })).toHaveAttribute(
    'href',
    '/api/v1/openapi.json',
  );
  await expectAccessible(page);
  const doc = await request.get('/api/v1/openapi.json');
  expect((await doc.json()).openapi).toBe('3.1.0');
  const noKey = await request.get('/api/v1/moves');
  expect(noKey.status()).toBe(401);
});
