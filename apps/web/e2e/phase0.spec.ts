import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 0 "done when": a signed-in user of each role lands on an empty, fully styled dashboard
 * in both themes, and accessibility (incl. contrast) passes.
 */
const roles = [
  { name: 'Reader', email: 'reader@sample.cmobeat.dev', path: '/account', heading: /Welcome/ },
  {
    name: 'Candidate',
    email: 'candidate@sample.cmobeat.dev',
    path: '/me',
    heading: 'Your profile is visible to no one.',
  },
  {
    name: 'Employer',
    email: 'employer@sample.cmobeat.dev',
    path: '/employer',
    heading: 'Define the seat before you fill it.',
  },
  {
    name: 'Editor',
    email: 'editor@sample.cmobeat.dev',
    path: '/console',
    heading: /Nothing reaches a reader/,
  },
  {
    name: 'Talent partner',
    email: 'talent@sample.cmobeat.dev',
    path: '/console',
    heading: /Nothing reaches a reader/,
  },
  {
    name: 'Admin',
    email: 'admin@sample.cmobeat.dev',
    path: '/console',
    heading: /Nothing reaches a reader/,
  },
] as const;

async function signInAs(page: Page, email: string) {
  await page.goto('/sign-in');
  await page
    .locator('form', { has: page.locator(`input[value="${email}"]`) })
    .getByRole('button')
    .click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

async function expectAccessible(page: Page) {
  // Let theme and colour transitions (240–480ms) settle so axe measures final colours.
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
}

for (const role of roles) {
  test(`${role.name} lands on a styled dashboard in both themes`, async ({ page }) => {
    await signInAs(page, role.email);
    await expect(page).toHaveURL(new RegExp(`${role.path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(role.heading);

    // Private areas default to Retreat (dark).
    const shell = page.locator('[data-area]');
    await expect(shell).toHaveAttribute('data-theme', 'retreat');
    await expectAccessible(page);

    // Switch to Lab (light) and re-check.
    await page.getByRole('radio', { name: 'Lab' }).click();
    await expect(shell).toHaveAttribute('data-theme', 'lab');
    await expectAccessible(page);

    // Back to the area default.
    await page.getByRole('radio', { name: 'Auto' }).click();
    await expect(shell).toHaveAttribute('data-theme', 'retreat');
  });
}

test('signed-out visitors are sent to sign in', async ({ page }) => {
  await page.goto('/me');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fme/);
});

test('an employer cannot enter candidate or staff areas', async ({ page }) => {
  await signInAs(page, 'employer@sample.cmobeat.dev');
  await expect(page).toHaveURL(/\/employer$/);
  await page.goto('/me');
  await expect(page).toHaveURL(/\/employer$/);
  await page.goto('/console');
  await expect(page).toHaveURL(/\/employer$/);
});

test('a candidate cannot enter the staff console', async ({ page }) => {
  await signInAs(page, 'candidate@sample.cmobeat.dev');
  await page.goto('/console');
  await expect(page).toHaveURL(/\/me$/);
});

test('public home defaults to Lab and is accessible', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-area="public"]')).toHaveAttribute('data-theme', 'lab');
  await expectAccessible(page);
});

test('security headers are set', async ({ request }) => {
  const res = await request.get('/');
  const h = res.headers();
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['strict-transport-security']).toContain('max-age=');
  expect(h['x-powered-by']).toBeUndefined();
});

test('Cmd+K opens the command palette', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard shortcut is desktop-only');
  await signInAs(page, 'admin@sample.cmobeat.dev');
  // Retry until the page has hydrated and the shortcut listener is attached. (Waiting for
  // network idle is unreliable: background prefetches can stay open.)
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(async () => {
    if (!(await palette.isVisible())) await page.keyboard.press('ControlOrMeta+k');
    await expect(palette).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
});
