import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import postgres from 'postgres';

/**
 * Phase 1 editorial acceptance: an editor reviews an AI-drafted move and publishes it; an editor
 * writes, submits and publishes an article. Nothing is public until a human approves it.
 */

for (const f of ['.env', '../../.env'])
  if (existsSync(f) && !process.env.DATABASE_URL) process.loadEnvFile(f);

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
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

/** Inserts a draft the way the Moves Tracker does (system connection, with a source and confidence). */
async function createDraftMove(person: string) {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    const [company] =
      await sql`select id from companies where deleted_at is null order by name limit 1`;
    const [row] = await sql`
      insert into moves (person_name, company_id, move_type, title, effective_date, sources, confidence, summary, status)
      values (${person}, ${company!.id}, 'appointed', 'Chief Marketing Officer', '2026-11-02',
              ${sql.json([{ url: 'https://newsroom.example/press/appointment', label: 'Company newsroom', kind: 'newsroom' }])},
              0.78, 'Appointed to lead marketing.', 'draft')
      returning id`;
    return row!.id as string;
  } finally {
    await sql.end();
  }
}

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test('an editor reviews an AI-drafted move, edits it, and publishes it', async ({
  page,
  request,
}) => {
  const person = `Avery Test ${unique()}`;
  const id = await createDraftMove(person);

  // Not public while it's a draft.
  expect((await request.get(`/api/moves/${id}`)).status()).toBe(404);

  await signInAs(page, 'editor@sample.cmobeat.dev');
  await page.goto('/console/editorial');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Nothing publishes until you approve it.',
  );
  await expectAccessible(page);

  await page.getByRole('link', { name: new RegExp(person) }).click();
  await expect(page).toHaveURL(new RegExp(`/console/editorial/moves/${id}$`));
  await expect(page.getByText('Drafted by Moves Tracker').first()).toBeVisible();
  await expect(page.getByText(/Moderate confidence/).first()).toBeVisible();
  await expectAccessible(page);

  await page.getByLabel('Summary').fill('Appointed to rebuild brand and demand after a pivot.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status')).toContainText('1 field changed');

  await page.getByRole('button', { name: 'Approve and publish' }).click();
  await expect(page).toHaveURL(/done=move-approved/);
  await expect(page.getByText('Move approved and published.')).toBeVisible();

  // Now public, with the editor's wording.
  const res = await request.get(`/api/moves?q=${encodeURIComponent(person)}`);
  const { data } = (await res.json()) as {
    data: { id: string; summary: string; status: string }[];
  };
  expect(data).toHaveLength(1);
  expect(data[0]).toMatchObject({
    id,
    status: 'approved',
    summary: 'Appointed to rebuild brand and demand after a pivot.',
  });
});

test('an editor rejects a move with a note and it stays private', async ({ page, request }) => {
  const person = `Rowan Test ${unique()}`;
  const id = await createDraftMove(person);
  await signInAs(page, 'editor@sample.cmobeat.dev');
  await page.goto(`/console/editorial/moves/${id}`);
  await page.getByRole('button', { name: 'Reject' }).click();
  await page.getByLabel('Why reject it?').fill('Single source, not confirmed by the company.');
  await page.getByRole('button', { name: 'Confirm rejection' }).click();
  await expect(page).toHaveURL(/done=move-rejected/);
  expect((await request.get(`/api/moves/${id}`)).status()).toBe(404);
});

test('an editor writes, submits and publishes an article', async ({ page, request }) => {
  const title = `What the first ninety days really cost ${unique()}`;
  await signInAs(page, 'editor@sample.cmobeat.dev');
  await page.goto('/console/editorial/articles/new');
  await page.getByLabel('Headline').fill(title);
  await page.getByLabel('Dek').fill('Forty CMOs on the decisions that could not wait.');
  await page.getByLabel('Body · MDX').fill('The first week is for listening.\n\n');
  await page.getByRole('button', { name: 'PullQuote' }).click();

  // Live preview renders the pull quote with the public renderer.
  const preview = page.getByRole('region', { name: 'Preview' });
  await expect(preview.getByText('The line worth quoting.')).toBeVisible();
  await expect(preview.getByText('The first week is for listening.')).toBeVisible();

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page).toHaveURL(/\/console\/editorial\/articles\/[0-9a-f-]{36}\?saved=1$/);
  const id = page.url().match(/articles\/([0-9a-f-]{36})/)![1]!;
  const slug = await page.getByLabel('Slug').inputValue();
  await expectAccessible(page);

  // Drafts are not public.
  expect((await request.get(`/api/articles/${slug}`)).status()).toBe(404);

  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText(/Waiting for an editor/)).toBeVisible();

  // Publishing your own draft needs an explicit confirmation.
  const publish = page.getByRole('button', { name: 'Publish' });
  await expect(publish).toBeDisabled();
  await page.getByLabel(/You are publishing your own draft/).check();
  await publish.click();
  await expect(page).toHaveURL(/done=article-published/);

  const res = await request.get(`/api/articles/${slug}`);
  expect(res.status()).toBe(200);
  expect(((await res.json()) as { data: { id: string; status: string } }).data).toMatchObject({
    id,
    status: 'published',
  });
});

test('broken MDX is caught before it can be submitted', async ({ page }) => {
  await signInAs(page, 'editor@sample.cmobeat.dev');
  await page.goto('/console/editorial/articles/new');
  await page.getByLabel('Body · MDX').fill('Hello <Chart data="x" />');
  await expect(page.getByText(/This won.t publish yet: Unknown component: Chart/)).toBeVisible();
});

test('a reader cannot reach the console', async ({ page }) => {
  await signInAs(page, 'reader@sample.cmobeat.dev');
  await page.goto('/console/editorial');
  await expect(page).toHaveURL(/\/account$/);
});

test('a talent partner sees the console but not the editorial queue', async ({ page }) => {
  await signInAs(page, 'talent@sample.cmobeat.dev');
  await page.goto('/console/editorial');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Editorial is for editors.');
});

test('the API refuses anonymous approvals', async ({ request }) => {
  const id = await createDraftMove(`Anon Test ${unique()}`);
  const res = await request.post(`/api/moves/${id}/transition`, { data: { action: 'approve' } });
  expect(res.status()).toBe(403);
});

test('the console shows real editorial counts', async ({ page }) => {
  await createDraftMove(`Count Test ${unique()}`);
  await signInAs(page, 'editor@sample.cmobeat.dev');
  await page.goto('/console');
  const card = page.getByRole('link', { name: /Moves awaiting review/ });
  await expect(card).toBeVisible();
  expect(Number((await card.locator('.numeric').first().innerText()).trim())).toBeGreaterThan(0);
  await expectAccessible(page);
});
