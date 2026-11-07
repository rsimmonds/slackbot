import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import postgres from 'postgres';

if (!process.env.DATABASE_URL && existsSync('../../.env')) process.loadEnvFile('../../.env');

const TAG = 'E2E compliance sponsor';
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function db<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
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
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
}

const consentCookie = async (page: Page) =>
  (await page.context().cookies()).find((c) => c.name === 'cmob_consent')?.value;

test.describe('cookie consent, first visit', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the banner offers Decline as prominently as Accept, and declining loads nothing', async ({
    page,
  }) => {
    await page.goto('/');
    const banner = page.getByRole('region', { name: 'Cookie choices' });
    await expect(banner).toBeVisible();
    const decline = banner.getByRole('button', { name: 'Decline analytics' });
    const accept = banner.getByRole('button', { name: 'Accept analytics' });
    await expect(decline).toBeVisible();
    await expect(accept).toBeVisible();
    // Same variant and size: neither choice is visually favoured.
    expect(await decline.getAttribute('class')).toBe(await accept.getAttribute('class'));
    await expectAccessible(page);
    await expect(page.locator('[data-analytics="enabled"]')).toHaveCount(0);

    await decline.click();
    await expect(banner).toBeHidden();
    expect(await consentCookie(page)).toMatch(/^v1\.a0\.\d+$/);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Cookie choices' })).toHaveCount(0);
    await expect(page.locator('[data-analytics="enabled"]')).toHaveCount(0);
  });

  test('accepting turns analytics on, and the choice can be changed in cookie settings', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .getByRole('region', { name: 'Cookie choices' })
      .getByRole('button', { name: 'Accept analytics' })
      .click();
    expect(await consentCookie(page)).toMatch(/^v1\.a1\.\d+$/);
    await page.reload();
    await expect(page.locator('[data-analytics="enabled"]')).toHaveCount(1);

    await page.goto('/legal/cookies');
    const box = page.getByRole('checkbox', { name: /Analytics/ });
    await expect(box).toBeChecked();
    await box.uncheck();
    await page.getByRole('button', { name: 'Save choice' }).click();
    await expect(page.getByRole('status')).toContainText('Saved');
    expect(await consentCookie(page)).toMatch(/^v1\.a0\.\d+$/);
    await page.reload();
    await expect(page.locator('[data-analytics="enabled"]')).toHaveCount(0);
  });
});

test.describe('Global Privacy Control', () => {
  test.use({
    extraHTTPHeaders: { 'Sec-GPC': '1' },
    storageState: {
      cookies: [
        {
          name: 'cmob_consent',
          value: 'v1.a1.1794000000',
          domain: 'localhost',
          path: '/',
          expires: 1950000000,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    },
  });

  test('counts as a decline: no banner, no analytics, even over a stored yes', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Cookie choices' })).toHaveCount(0);
    await expect(page.locator('[data-analytics="enabled"]')).toHaveCount(0);
    await page.goto('/legal/cookies');
    await expect(
      page.getByText('Your browser sends Global Privacy Control, so analytics stays off.'),
    ).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Analytics/ })).toBeDisabled();
  });
});

test('legal pages render as drafts and are accessible', async ({ page }) => {
  for (const [path, heading] of [
    ['/legal/privacy', 'Privacy'],
    ['/legal/terms', 'Terms'],
    ['/legal/cookies', 'Cookies'],
    ['/legal/subprocessors', 'Subprocessors'],
    ['/legal/ai', 'How we use AI'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.getByText('Draft — pending legal review')).toBeVisible();
    await expectAccessible(page);
  }
  await page.goto('/legal/subprocessors');
  await expect(page.getByRole('heading', { name: 'Anthropic' })).toBeVisible();
  await page.goto('/legal/ai');
  await expect(page.getByRole('heading', { name: 'Matcher' })).toBeVisible();
});

test('the footer links to every legal page and cookie settings', async ({ page }) => {
  await page.goto('/');
  const legal = page.getByRole('navigation', { name: 'Legal' });
  await expect(legal.getByRole('link', { name: 'Cookie settings' })).toHaveAttribute(
    'href',
    '/legal/cookies',
  );
  await expect(legal.getByRole('link', { name: 'How we use AI' })).toHaveAttribute(
    'href',
    '/legal/ai',
  );
});

test.describe('sponsorships', () => {
  // These write shared rows to the dev database, so run them once (desktop) and serially.
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'database-writing flow runs on desktop only');

  test.afterAll(async () => {
    await db((sql) => sql`delete from sponsorships where sponsor_name like ${`${TAG}%`}`);
  });

  test('an admin books a sponsorship and it appears on the home page, labelled and rel=sponsored', async ({
    page,
  }) => {
    await db((sql) => sql`delete from sponsorships where placement = 'home'`);
    await signInAs(page, 'admin@sample.cmobeat.dev');
    await page.goto('/console/sponsorships/new');
    await page.getByLabel('Sponsor').fill(`${TAG} Northwind`);
    await page.getByLabel('Placement').selectOption('home');
    await page.getByLabel('Headline').fill('The CMO benchmark report');
    await page.getByLabel('Body').fill('Free for subscribers.');
    await page.getByLabel('Link').fill('https://northwind.example/report');
    await page.getByLabel('Starts').fill(day(0));
    await page.getByLabel('Ends').fill(day(3));
    await page.getByLabel('Amount').fill('5000');
    await page.getByRole('button', { name: 'Book sponsorship' }).click();
    await expect(page).toHaveURL(/\/console\/sponsorships\?saved=/);
    await expect(page.getByRole('link', { name: `${TAG} Northwind` })).toBeVisible();
    await expectAccessible(page);

    await page.goto('/');
    const slot = page.getByRole('complementary', { name: `Sponsored by ${TAG} Northwind` });
    await expect(slot).toBeVisible();
    await expect(slot.getByText('Sponsored', { exact: true })).toBeVisible();
    const link = slot.getByRole('link', { name: /The CMO benchmark report/ });
    await expect(link).toHaveAttribute('rel', /\bsponsored\b/);
    await expect(link).toHaveAttribute('rel', /\bnoopener\b/);
    await expect(link).toHaveAttribute('href', 'https://northwind.example/report');
    await expect(slot.locator('img, script, iframe')).toHaveCount(0);
  });

  test('a booking shows only within its dates', async ({ page }) => {
    await db(async (sql) => {
      await sql`delete from sponsorships where placement in ('jobs_index', 'article_foot')`;
      await sql`insert into sponsorships (sponsor_name, placement, creative, start_date, end_date, amount, currency)
        values (${`${TAG} future`}, 'jobs_index', ${sql.json({ headline: 'Future booking', url: 'https://future.example' })}, ${day(5)}, ${day(9)}, 100, 'USD'),
               (${`${TAG} past`}, 'jobs_index', ${sql.json({ headline: 'Past booking', url: 'https://past.example' })}, ${day(-9)}, ${day(-2)}, 100, 'USD')`;
    });
    await page.goto('/jobs');
    await expect(page.locator('[data-sponsorship="jobs_index"]')).toHaveCount(0);

    await db(
      (sql) =>
        sql`update sponsorships set start_date = ${day(-1)} where sponsor_name = ${`${TAG} future`}`,
    );
    await page.reload();
    await expect(page.locator('[data-sponsorship="jobs_index"]')).toContainText('Future booking');
    await expect(page.getByText('Past booking')).toHaveCount(0);
  });

  test('an admin ends a booking and it disappears', async ({ page }) => {
    await signInAs(page, 'admin@sample.cmobeat.dev');
    await page.goto('/console/sponsorships');
    await page.getByRole('button', { name: `End sponsorship for ${TAG} Northwind` }).click();
    await expect(page).toHaveURL(/ended=1/);
    await page.goto('/');
    await expect(page.locator('[data-sponsorship="home"]')).toHaveCount(0);
  });
});

test('staff who are not admins cannot manage sponsorships; readers cannot reach the console', async ({
  page,
}) => {
  await signInAs(page, 'editor@sample.cmobeat.dev');
  await page.goto('/console/sponsorships');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Sponsorships are managed by admins.',
  );
  await page.goto('/console/sponsorships/new');
  await expect(page.getByRole('button', { name: 'Book sponsorship' })).toHaveCount(0);

  await page.context().clearCookies();
  await signInAs(page, 'reader@sample.cmobeat.dev');
  await page.goto('/console/sponsorships');
  await expect(page).not.toHaveURL(/\/console/);
});

test('staff see agent monitoring with eval results', async ({ page }) => {
  await signInAs(page, 'talent@sample.cmobeat.dev');
  await page.goto('/console/agents');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Every AI call, logged.');
  await expect(page.getByText('Latest offline results')).toBeVisible();
  await expect(page.getByText(/\d+ cases · offline \d+\/\d+/).first()).toBeVisible();
  await expectAccessible(page);
});
