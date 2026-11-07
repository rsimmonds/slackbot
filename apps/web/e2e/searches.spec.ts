import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

/**
 * Phase 3 (paid searches): an employer requests a search with explicit acceptance of the fee
 * terms, a talent partner takes it and moves it through each stage, records the placement of a
 * revealed candidate, the employer is invoiced 12% of first-year cash comp, and staff mark the
 * TEST invoice paid through the real webhook. The fractional monthly job is covered by the
 * integration tests (one invoice per month, none after closing).
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

const db = () => postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

/** A confirmed full-time mandate for the dev employer's company. */
async function confirmedMandate(title: string) {
  const sql = db();
  try {
    const [m] = await sql<{ id: string }[]>`
      insert into mandates (company_id, source, title, level, work_type, comp_basis, comp_min, comp_max,
                            currency, market, priorities, reporting_line, confirmed_at)
      select em.company_id, 'builder', ${title}, 'cmo', 'full_time', 'annual', 380000, 450000,
             'USD', 'US', '["Rebuild demand","Reposition the brand","Hire a PMM lead"]'::jsonb, 'CEO', now()
      from employer_members em join users u on u.id = em.user_id
      where u.email = 'employer@sample.cmobeat.dev' limit 1
      returning id`;
    return m!.id;
  } finally {
    await sql.end();
  }
}

/**
 * A revealed match for the mandate, with the candidate's accepted, live reveal consent — what the
 * matching and reveal flows produce. Written as the system.
 */
async function revealedMatch(mandateId: string) {
  const sql = db();
  try {
    const [p] = await sql<{ id: string; user_id: string }[]>`
      select id, user_id from candidate_profiles
      where visibility <> 'hidden' and headline is not null and deleted_at is null
      order by random() limit 1`;
    const [talent] = await sql<
      { id: string }[]
    >`select id from users where email = 'talent@sample.cmobeat.dev'`;
    const [employer] = await sql<
      { id: string }[]
    >`select id from users where email = 'employer@sample.cmobeat.dev'`;
    const [m] = await sql<{ id: string }[]>`
      insert into matches (mandate_id, profile_id, score_low, score_high, rationale, status, reviewed_by, reviewed_at)
      values (${mandateId}, ${p!.id}, 0.6, 0.8, '{"summary":"e2e"}'::jsonb, 'revealed', ${talent!.id}, now())
      returning id`;
    const [c] = await sql<{ id: string }[]>`
      insert into consents (subject_user_id, kind, scope)
      values (${p!.user_id}, 'reveal', ${sql.json({ matchId: m!.id })}) returning id`;
    await sql`
      insert into reveal_requests (match_id, requested_by, candidate_decision, decided_at, consent_id)
      values (${m!.id}, ${employer!.id}, 'accepted', now(), ${c!.id})`;
    return m!.id;
  } finally {
    await sql.end();
  }
}

test('employer requests a search, talent partner places a revealed candidate, invoice is paid', async ({
  page,
}, info) => {
  test.slow();
  const title = `Chief Marketing Officer ${info.project.name} ${Date.now().toString(36)}`;
  const mandateId = await confirmedMandate(title);

  // 1. The employer requests a search from the mandate, accepting the terms explicitly.
  await signInAs(page, 'employer@sample.cmobeat.dev');
  await page.goto(`/employer/mandates/${mandateId}`);
  await page.getByRole('link', { name: 'Request a search' }).click();
  await page.waitForURL(/\/employer\/searches\/new\?mandate=/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Request a search');
  await expect(page.getByText('12%', { exact: true })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel(/I accept these fee terms/).check();
  await page.getByRole('button', { name: 'Request search' }).click();
  await page.waitForURL(/\/employer\/searches\/[0-9a-f-]{36}\?requested=1$/);
  const searchId = page.url().match(/searches\/([0-9a-f-]{36})/)![1]!;
  await expect(
    page.getByText('Search requested. Your accepted terms are saved with it.'),
  ).toBeVisible();
  await expect(page.getByLabel('Search history')).toContainText('fee terms accepted');
  await expectAccessible(page);

  // 2. The talent partner takes it and moves it along. Matching is another workstream: until
  //    it lands, sourcing still moves on with a plain warning.
  await signInAs(page, 'talent@sample.cmobeat.dev');
  await page.goto('/console/searches');
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
  await page.goto(`/console/searches/${searchId}`);
  await page.getByRole('button', { name: 'Take this search' }).click();
  await expect(page.getByText('The search is yours.')).toBeVisible();
  await page.getByRole('button', { name: 'Move to sourcing' }).click();
  await expect(page.getByText(/Moved to sourcing|Moved\. The employer/)).toBeVisible();
  await page.getByRole('button', { name: 'Move to shortlist' }).click();
  await expect(page.getByText('Moved. The employer has been told.')).toBeVisible();

  // 3. A candidate has revealed themselves (with consent); the talent partner records the hire.
  await revealedMatch(mandateId);
  await page.reload();
  await page.getByLabel('Candidate (revealed)').selectOption({ index: 1 });
  await page.getByLabel(/First-year cash compensation/).fill('400,000');
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Record placement and invoice' }).click();
  await expect(page.getByText('Placement recorded. The employer has been invoiced.')).toBeVisible();
  await expect(page.getByText('$48,000.00')).toBeVisible();

  // 4. The employer sees the open invoice for 12% of $400,000.
  await signInAs(page, 'employer@sample.cmobeat.dev');
  await page.goto(`/employer/searches/${searchId}`);
  await expect(page.getByText('$48,000.00')).toBeVisible();
  await page.getByRole('link', { name: 'View invoice' }).click();
  await page.waitForURL(/\/billing\/invoices\/fake_in_[0-9a-f]{32}$/);
  const invoiceUrl = page.url();
  const invoice = page.getByRole('article', { name: 'Invoice' });
  await expect(invoice).toContainText('12% of first-year cash compensation ($400,000)');
  await expect(invoice).toContainText('$48,000.00');
  await expect(invoice).toContainText('Open');
  await expect(page.getByRole('button', { name: 'Mark paid (test)' })).toHaveCount(0);
  await expectAccessible(page);

  // 5. An admin marks the TEST invoice paid; the signed event goes through the real webhook.
  await signInAs(page, 'admin@sample.cmobeat.dev');
  await page.goto(invoiceUrl);
  await page.getByRole('button', { name: 'Mark paid (test)' }).click();
  await page.waitForURL(/\?paid=1$/);
  await expect(page.getByRole('article', { name: 'Invoice' })).toContainText('Paid');

  // 6. The employer's billing page shows it paid.
  await signInAs(page, 'employer@sample.cmobeat.dev');
  await page.goto('/employer/billing');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Billing');
  const ref = invoiceUrl.split('/').pop()!;
  const row = page.locator(`[data-invoice="${ref}"]`);
  await expect(row).toContainText('AI-assisted search · success fee');
  await expect(row).toContainText('$48,000.00');
  await expect(row).toContainText('Paid');
  await expectAccessible(page);
});

test('others cannot run searches or read invoices', async ({ page }) => {
  await signInAs(page, 'employer@sample.cmobeat.dev');
  await page.goto('/console/searches');
  await expect(page).toHaveURL(/\/employer$/);
  const status = await page.request.post(
    '/api/searches/00000000-0000-4000-8000-000000000000/assign',
  );
  expect(status.status()).toBe(403);

  await signInAs(page, 'candidate@sample.cmobeat.dev');
  expect((await page.request.get('/api/billing/invoices')).status()).toBe(403);
  const res = await page.goto(`/billing/invoices/fake_in_${'0'.repeat(32)}`);
  expect(res!.status()).toBe(404);
});
