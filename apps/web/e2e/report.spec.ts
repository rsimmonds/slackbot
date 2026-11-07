import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

/**
 * Phase 4 acceptance: the annual report captures leads into the subscriber list.
 * With the newsletter box ticked: download works, a pending subscriber in the 'report' segment
 * exists, confirming activates it. Without it: download works and no subscription is created.
 * An editor sees both leads.
 */

async function expectAccessible(page: Page) {
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
}

async function signInAs(page: Page, email: string) {
  await page.goto('/sign-in');
  await page
    .locator('form', { has: page.locator(`input[value="${email}"]`) })
    .getByRole('button')
    .click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

async function requestReport(page: Page, email: string, optIn: boolean) {
  await page.goto('/data/report');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('State of the CMO Seat');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel(/Company/).fill('Sample Holdings');
  await page.getByLabel('Where you work').selectOption('UK');
  const box = page.getByRole('checkbox');
  await expect(box).not.toBeChecked(); // marketing consent is never pre-ticked
  if (optIn) await box.check();
  await page.getByRole('button', { name: 'Get the report' }).click();
  const link = page.getByRole('link', { name: 'Download the report (PDF)' });
  await expect(link).toBeVisible();
  const href = (await link.getAttribute('href'))!;
  const res = await page.request.get(href);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/pdf');
  expect((await res.body()).length).toBeGreaterThan(5_000);
}

test('the report gate captures leads, with and without newsletter consent', async ({
  page,
}, info) => {
  const stamp = `${info.project.name}-${Date.now()}`;
  const optedIn = `report-in-${stamp}@sample.cmobeat.dev`;
  const leadOnly = `report-only-${stamp}@sample.cmobeat.dev`;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    await page.goto('/data/report');
    await expectAccessible(page);

    // 1. With the newsletter box ticked.
    await requestReport(page, optedIn, true);
    await expect(page.getByText(/confirm the newsletter/)).toBeVisible();
    const [sub] = await sql<{ status: string; segments: string[]; confirm_token: string }[]>`
      select status, segments, confirm_token from subscribers where email = ${optedIn}`;
    expect(sub!.status).toBe('pending');
    expect(sub!.segments).toContain('report');
    const mails = await sql<{ template: string }[]>`
      select template from email_outbox where to_email = ${optedIn} order by template`;
    expect(mails.map((m) => m.template)).toEqual(['newsletter-confirm', 'report-download']);
    await page.goto(`/newsletter/confirm?token=${sub!.confirm_token}`);
    await page.getByRole('button', { name: 'Confirm subscription' }).click();
    await expect(page.getByText('You are subscribed.')).toBeVisible();
    const [after] = await sql<{ status: string }[]>`
      select status from subscribers where email = ${optedIn}`;
    expect(after!.status).toBe('active');

    // 2. Without it: the report, a lead, and no subscription.
    await requestReport(page, leadOnly, false);
    const none = await sql`select 1 from subscribers where email = ${leadOnly}`;
    expect(none).toHaveLength(0);
    const [lead] = await sql<{ newsletter_opt_in: boolean }[]>`
      select newsletter_opt_in from report_downloads where email = ${leadOnly}`;
    expect(lead!.newsletter_opt_in).toBe(false);

    // 3. An editor sees both leads.
    await signInAs(page, 'editor@sample.cmobeat.dev');
    await page.goto('/console/leads');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Who asked for the report.');
    const table = page.getByRole('region', { name: 'Report leads' });
    await expect(table).toContainText(optedIn);
    await expect(table).toContainText(leadOnly);
    await expect(table.locator('tr', { hasText: optedIn })).toContainText('Confirmed');
    await expect(table.locator('tr', { hasText: leadOnly })).toContainText('Report only');
    await expectAccessible(page);
  } finally {
    await sql.end();
  }
});

test('a reader cannot see report leads', async ({ page }) => {
  await signInAs(page, 'reader@sample.cmobeat.dev');
  await page.goto('/console/leads');
  await expect(page).not.toHaveURL(/\/console\/leads/);
  // The proxy redirects non-staff away from /console; whatever comes back is never the CSV.
  const res = await page.request.get('/console/leads/export');
  expect(res.headers()['content-type'] ?? '').not.toContain('text/csv');
  expect(await res.text()).not.toContain('newsletter_opt_in');
});

test('a tampered download link is refused', async ({ page }) => {
  const res = await page.request.get(
    `/api/report/download?d=${crypto.randomUUID()}&t=9999999999.forged`,
  );
  expect(res.status()).toBe(403);
});

test('market and industry pages are quotable, accessible and offer a CSV', async ({ page }) => {
  await page.goto('/data');
  await page
    .getByRole('navigation', { name: 'Data by market' })
    .getByRole('link', { name: 'United States' })
    .click();
  await expect(page).toHaveURL(/\/data\/markets\/us$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('United States');
  await expect(page.getByText(/data as of \d{4}-\d{2}-\d{2}/)).toBeVisible();
  const ld = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').first().textContent())!,
  );
  expect(ld['@type']).toBe('Dataset');
  const csv = await page.request.get('/data/markets/us/data.csv');
  expect(csv.status()).toBe(200);
  expect(csv.headers()['content-type']).toContain('text/csv');
  expect(await csv.text()).not.toMatch(/@/);
  await expectAccessible(page);

  await page.goto('/data');
  const industry = page
    .getByRole('navigation', { name: 'Data by industry' })
    .getByRole('link')
    .first();
  await industry.click();
  await expect(page).toHaveURL(/\/data\/industries\/[a-z0-9-]+$/);
  await expect(page.getByText('Cite this')).toBeVisible();
  await expectAccessible(page);
});
