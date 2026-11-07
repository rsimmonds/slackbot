import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 1 acceptance (jobs): an employer pastes a description, confirms the mandate, pays (test
 * checkout), a person approves it, and the listing is live on /jobs with JobPosting JSON-LD.
 * Plus saved searches. Desktop and mobile.
 */
async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page
    .locator('form', { has: page.locator(`input[value="${email}"]`) })
    .getByRole('button')
    .click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
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

test('employer posts, pays, staff approves, and the role goes live with JSON-LD', async ({
  page,
}, info) => {
  test.slow();
  const token = `Zephyrine${info.project.name}${Date.now().toString(36)}`;
  const title = `Chief Marketing Officer ${token}`;

  // 1. Paste a description.
  await signInAs(page, 'employer@sample.cmobeat.dev');
  await page.goto('/employer/jobs/new');
  await expectAccessible(page);
  await page.getByLabel('Job description').fill(`${title}
Reports to the CEO. Team of 30.
Base $400,000 - $480,000
- Reposition the brand for the mid-market
- Build a demand engine the board trusts
- Hire a head of product marketing`);
  await page.getByRole('button', { name: 'Read this description' }).click();

  // 2. Edit and confirm the drafted mandate.
  await page.waitForURL(/\/employer\/jobs\/[0-9a-f-]+\/edit\?parsed=1/);
  await expect(page.getByLabel('Title')).toHaveValue(title);
  await expect(page.getByLabel('From')).toHaveValue('400000');
  await expect(page.getByText('Describe the scope in a sentence or two.')).toBeVisible();
  await page
    .getByLabel('Scope')
    .fill('Owns brand, demand and product marketing across North America.');
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Confirm mandate' }).click();
  await page.waitForURL(/confirmed=1/);

  // 3. Choose a plan and pay on the test checkout.
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.waitForURL(/\/checkout\/fake\/fake_cs_/);
  await expect(page.getByText('Test mode · no card is charged')).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: /^Pay \$499\.00/ }).click();
  await page.waitForURL(/\/employer\/jobs\?paid=/);
  const row = page.locator('tr', { hasText: title });
  await expect(row.getByText('With our editors')).toBeVisible();

  // 4. A person reviews and approves it.
  await signInAs(page, 'editor@sample.cmobeat.dev');
  await page.goto('/console/listings');
  await expectAccessible(page);
  const panel = page
    .locator('section', { hasText: title })
    .filter({ has: page.getByRole('button', { name: `Approve ${title}` }) });
  await expect(panel.getByText(/^Paid /)).toBeVisible();
  await panel.getByRole('button', { name: `Approve ${title}` }).click();
  await page.waitForURL(/decided=approve/);

  // 5. It is live for readers, with structured data.
  await page.context().clearCookies();
  await page.goto(`/jobs?q=${token}`);
  await expect(page.getByText('1 role')).toBeVisible();
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  await expect(page.locator('main article').first().getByText('$400K–$480K')).toBeVisible();
  const ld = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').first().textContent())!,
  );
  expect(ld).toMatchObject({
    '@type': 'JobPosting',
    title,
    employmentType: 'FULL_TIME',
    directApply: false,
    baseSalary: {
      currency: 'USD',
      value: { minValue: 400000, maxValue: 480000, unitText: 'YEAR' },
    },
  });
  await expectAccessible(page);
});

test('jobs index filters, shows comp on every card, and is accessible', async ({ page }) => {
  await page.goto('/jobs?work=fractional');
  const cards = page.locator('article');
  await expect(cards.first()).toBeVisible();
  for (const card of await cards.all()) {
    await expect(card).toContainText('Fractional');
    await expect(card).toContainText('/ mo');
  }
  await expectAccessible(page);
  await page.goto('/jobs');
  await expect(page.locator('[data-area="public"]')).toHaveAttribute('data-theme', 'lab');
  await expect(page.getByText(/^\d+ roles$/)).toBeVisible();
});

test('a reader saves a search and removes it', async ({ page }, info) => {
  await signInAs(page, 'reader@sample.cmobeat.dev');
  await page.goto('/jobs?level=cmo&market=US');
  const name = `E2E search ${info.project.name} ${Date.now().toString(36)}`;
  await page.getByLabel('Search name').fill(name);
  await page.getByLabel('Alert frequency').selectOption('daily');
  await page.getByRole('button', { name: 'Save search' }).click();
  await expect(page.getByText("Search saved. We'll email new matches.")).toBeVisible();

  await page.goto('/account/searches');
  await expect(page.getByRole('link', { name })).toBeVisible();
  await expect(page.getByText('CMO · United States · daily alerts').first()).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: `Remove ${name}` }).click();
  await expect(page.getByRole('link', { name })).toHaveCount(0);
});

test('signed-out visitors are asked to sign in before saving or applying', async ({ page }) => {
  await page.goto('/jobs');
  await expect(page.getByRole('link', { name: 'Sign in to save this search' })).toBeVisible();
  await page.locator('article a').first().click();
  await expect(page.getByRole('link', { name: 'Sign in to apply' })).toBeVisible();
});
