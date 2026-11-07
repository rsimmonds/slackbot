import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Phase 3: the Matcher's weekly fairness report, visible to staff only. */

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

test('a talent partner runs the fairness report and reads the selection rates', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signInAs(page, 'talent@sample.cmobeat.dev');
  await page.goto('/console/fairness');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'The Matcher, tested for bias every week.',
  );
  await page.getByRole('button', { name: 'Run the report now' }).click();
  await page.waitForURL(/\/console\/fairness\?ran=1/);
  await expect(page.getByRole('status').filter({ hasText: 'Report recorded.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Passed' })).toBeVisible();
  const table = page.getByRole('region', { name: 'Selection rates by group' });
  await expect(table).toContainText('gender');
  await expect(table).toContainText('family status');
  await expect(page.getByText('Synthetic data only.')).toBeVisible();
  await expectAccessible(page);
});

for (const who of ['employer', 'reader', 'candidate'] as const) {
  test(`${who} cannot open the fairness report`, async ({ page }) => {
    await signInAs(page, `${who}@sample.cmobeat.dev`);
    await page.goto('/console/fairness');
    await expect(page).not.toHaveURL(/\/console\/fairness/);
  });
}
