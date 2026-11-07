import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 3, real pipeline: a talent partner runs blind matching for a confirmed mandate (offline
 * Matcher), the proposals arrive as proposals only, and approving one adds the amber Human
 * Review seal. The full reveal and consent path is covered in review.spec.ts.
 */

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

test('a talent partner runs matching, then approves a proposal', async ({ page, isMobile }) => {
  test.skip(isMobile, 'one run is enough: matching writes shared proposals');
  test.setTimeout(180_000);
  await signInAs(page, 'talent@sample.cmobeat.dev');
  await page.goto('/console/matches');

  // Run matching on confirmed mandates until the Matcher proposes someone.
  const buttons = page.getByRole('button', { name: /^Run matching for / });
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  let matched = false;
  for (let i = 0; i < count && !matched; i++) {
    const button = buttons.nth(i);
    await button.click();
    // Each mandate's form has its own status line; read the one for the button just clicked.
    const status = button
      .locator('xpath=ancestor::form')
      .getByRole('status')
      .filter({ hasText: /matched|No new matches/ });
    await expect(status).toBeVisible({ timeout: 60_000 });
    matched = /I matched \d+ leaders\. A human will review them/.test(
      (await status.textContent()) ?? '',
    );
  }
  expect(matched, 'the offline Matcher proposed nobody for any seeded mandate').toBe(true);

  // Proposals only: open one, see blue machine status, approve as a human.
  await page.reload();
  const proposal = page.locator('a[href^="/console/matches/"]').first();
  await proposal.click();
  await page.waitForURL(/\/console\/matches\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/awaiting human review/i).first()).toBeVisible();
  await expect(page.getByText('Estimated fit')).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Approve match' }).click();
  await expect(page.getByText('Human review').first()).toBeVisible({ timeout: 15_000 });
});
