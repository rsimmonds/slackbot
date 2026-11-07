import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import postgres from 'postgres';

/**
 * Moves Tracker reader tips. Desktop signs in as the reader, mobile as the candidate, so the two
 * projects never share a daily tip allowance.
 */
const userFor = (isMobile: boolean) =>
  isMobile ? 'candidate@sample.cmobeat.dev' : 'reader@sample.cmobeat.dev';

test.beforeAll(async () => {
  if (!process.env.DATABASE_URL && existsSync('../../.env')) process.loadEnvFile('../../.env');
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    // Test hygiene only: clear the sample users' earlier tips so the daily limit starts fresh.
    await sql`delete from source_items where kind = 'submission' and submitted_by in (
      select id from users where email in ('reader@sample.cmobeat.dev', 'candidate@sample.cmobeat.dev') and is_sample)`;
  } finally {
    await sql.end();
  }
});

async function expectAccessible(page: Page) {
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
}

test('signed-out visitors are asked to sign in before sending a tip', async ({ page }) => {
  await page.goto('/moves/submit');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Seen a move in the seat?');
  await expect(page.locator('[data-area="public"]')).toHaveAttribute('data-theme', 'lab');
  await expect(page.getByRole('link', { name: 'Sign in' }).last()).toHaveAttribute(
    'href',
    '/sign-in?next=%2Fmoves%2Fsubmit',
  );
  await expectAccessible(page);
});

test('a signed-in reader sends a tip; LinkedIn is refused', async ({ page, isMobile }) => {
  const email = userFor(isMobile);
  await page.goto('/sign-in?next=%2Fmoves%2Fsubmit');
  await page
    .locator('form', { has: page.locator(`input[value="${email}"]`) })
    .getByRole('button')
    .click();
  await page.waitForURL(/\/moves\/submit$/);
  await expectAccessible(page);

  await page.getByLabel('Person').fill('Leo Grant');
  await page.getByLabel('Company').fill('Verity Bank');
  await page.getByLabel('Role').fill('Chief Marketing Officer');
  await page.getByLabel('Public source').fill('https://www.linkedin.com/in/leo-grant');
  await page.getByRole('button', { name: 'Send tip' }).click();
  await expect(page.locator('form [role="alert"]')).toContainText('LinkedIn');

  await page
    .getByLabel('Public source')
    .fill(`https://news.verity.example/leo-grant-${Date.now()}-${isMobile ? 'm' : 'd'}`);
  await page.getByRole('button', { name: 'Send tip' }).click();
  await expect(page.getByRole('status')).toContainText('An editor will check the source');
  await expectAccessible(page);
});
