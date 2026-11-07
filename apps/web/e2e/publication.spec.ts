import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import postgres from 'postgres';

/**
 * Phase 1 publication flows: home, articles, interviews, moves, data, newsletter double opt-in,
 * SEO endpoints and the mobile menu. Runs on desktop and mobile.
 */

for (const f of ['../../.env', '.env']) if (existsSync(f)) process.loadEnvFile(f);

async function expectAccessible(page: Page) {
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

/** Each test signs up from its own address so the per-IP rate limit never interferes. */
test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': `192.0.2.${(info.workerIndex * 37 + info.repeatEachIndex + Date.now()) % 250}`,
  });
});

test('home shows the lead story, live moves, featured roles with comp, and passes axe', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const feed = page.getByRole('region', { name: 'CMO Moves' });
  await expect(feed.getByRole('listitem').first()).toBeVisible();
  const roles = page.getByRole('region', { name: 'Featured roles' });
  await expect(roles.getByRole('heading', { level: 3 })).toHaveCount(3);
  await expect(roles.getByText(/(USD|CAD|EUR|GBP)$/).first()).toBeVisible();
  await expect(page.getByText('Illustrative sample, not measured.').first()).toBeVisible();
  await expectAccessible(page);
});

test('an article shows editor review, structured data and related roles', async ({ page }) => {
  await page.goto('/articles');
  await page.getByRole('heading', { level: 3 }).first().getByRole('link').click();
  await expect(page).toHaveURL(/\/articles\/[a-z0-9-]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Editor reviewed')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Reading progress' })).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Roles open now' })).toBeVisible();
  const ld = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').first().textContent())!,
  );
  expect(ld['@type']).toMatch(/Article|Report/);
  expect(ld.publisher.name).toBe('CMO Beat');
  await expectAccessible(page);
});

test('an interview has chapters and a transcript', async ({ page }) => {
  await page.goto('/interviews');
  await page.getByRole('heading', { level: 3 }).first().getByRole('link').click();
  await expect(page).toHaveURL(/\/interviews\/[a-z0-9-]+$/);
  await expect(
    page.getByRole('navigation', { name: 'Chapters' }).getByRole('listitem').first(),
  ).toBeVisible();
  await expect(page.getByText('Transcript')).toBeVisible();
  await expectAccessible(page);
});

test('the Moves archive filters by type and search, and a move lists its sources', async ({
  page,
}) => {
  await page.goto('/moves');
  await page.getByLabel('Move type').selectOption('departed');
  await page.getByLabel('Search').fill('Corvid');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page).toHaveURL(/type=departed/);
  await expect(page.getByRole('status').filter({ hasText: 'match these filters' })).toContainText(
    '2 moves',
  );
  await expectAccessible(page);

  await page.getByRole('region', { name: 'Archive' }).getByRole('link').first().click();
  await expect(page).toHaveURL(/\/moves\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('departs as');
  const source = page.getByRole('link', { name: /opens in a new tab/ }).first();
  await expect(source).toHaveAttribute('rel', /nofollow/);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(ld['@type']).toBe('Person');
  await expectAccessible(page);
});

test('the Data page charts comp per currency with table views', async ({ page }) => {
  await page.goto('/data');
  await expect(
    page
      .getByRole('heading', { name: 'Moves by industry' })
      .or(page.getByText('Moves by industry'))
      .first(),
  ).toBeVisible();
  for (const c of ['USD', 'CAD', 'EUR', 'GBP']) {
    await expect(page.getByText(`${c} · annual base`)).toBeVisible();
  }
  await page.getByText('Show as table').first().click();
  await expect(page.getByRole('table').first()).toBeVisible();
  await expect(page.getByText('Illustrative sample. Not measured data.')).toBeVisible();
  await expectAccessible(page);
});

test('a reader subscribes, confirms, sets preferences and unsubscribes', async ({ page }, info) => {
  const email = `e2e-${info.project.name}-${Date.now()}@sample.cmobeat.dev`;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const latestToken = async (template: string) => {
    for (let i = 0; i < 20; i++) {
      const [row] = await sql<{ text: string }[]>`
        select payload->>'text' as text from email_outbox
        where to_email = ${email} and template = ${template} order by created_at desc limit 1`;
      const m = row?.text.match(/token=([0-9a-f]{64})/);
      if (m) return m[1]!;
      await page.waitForTimeout(250);
    }
    throw new Error(`no ${template} email for ${email}`);
  };
  try {
    await page.goto('/newsletter');
    await page.getByLabel('Work email').fill(email);
    await page.getByLabel('Where you work').selectOption('CA');
    await page.getByLabel('CMO moves').check();
    await page.getByRole('button', { name: 'Subscribe' }).click();
    await expect(page.getByText('Check your inbox to confirm.')).toBeVisible();

    await page.goto(`/newsletter/confirm?token=${await latestToken('newsletter-confirm')}`);
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Confirm subscription' }).click();
    await expect(page.getByText('You are subscribed.')).toBeVisible();

    const manage = await latestToken('newsletter-welcome');
    await page.goto(`/newsletter/preferences?token=${manage}`);
    await page.getByLabel('Monthly digest').check();
    await page.getByLabel('Comp data').check();
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByText('Preferences saved.')).toBeVisible();

    await page.goto(`/newsletter/unsubscribe?token=${manage}`);
    await page.getByRole('button', { name: 'Unsubscribe' }).click();
    await expect(page.getByText('You are unsubscribed.')).toBeVisible();
    const [row] = await sql<
      { status: string; market: string }[]
    >`select status, market from subscribers where email = ${email}`;
    expect(row).toEqual({ status: 'unsubscribed', market: 'CA' });
  } finally {
    await sql.end();
  }
});

test('SEO and AI-visibility endpoints are public and keep private areas out', async ({
  request,
}) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/moves/');
  expect(sitemap).toContain('/interviews/');
  expect(sitemap).not.toContain('/console');
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /console');
  expect(robots).toContain('Sitemap:');
  const llms = await request.get('/llms.txt');
  expect(llms.headers()['content-type']).toContain('text/plain');
  expect(await llms.text()).toContain('# CMO Beat');
  const feed = await request.get('/feed.xml');
  expect(feed.headers()['content-type']).toContain('application/rss+xml');
  expect(await feed.text()).toContain('<item>');
});

test('the mobile menu is keyboard and screen-reader friendly', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the menu replaces the nav below the md breakpoint');
  await page.goto('/');
  await page.getByRole('button', { name: /open publication menu/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Publication' });
  await expect(dialog).toBeVisible();
  await expectAccessible(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: /open publication menu/i }).click();
  await dialog.getByRole('link', { name: 'Data' }).click();
  await expect(page).toHaveURL(/\/data$/);
  await expect(dialog).toBeHidden();
});
