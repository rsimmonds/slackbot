import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 2 acceptance (Mandate Builder): an employer starts a session, answers it through to the
 * end (offline provider), reloads mid-way and resumes, edits and confirms the mandate, and
 * exports the PDF.
 */

/** Answers keyed by a phrase from each question (offline wording from the mandate spec). */
const answersByCue: [RegExp, string][] = [
  [/title/i, 'A full-time Chief Marketing Officer.'],
  [
    /why are you hiring|what happened in the business/i,
    'We closed our Series C and moved upmarket. Marketing is still built for SMB and the board wants a category leader.',
  ],
  [/report to/i, 'The CEO.'],
  [
    /twelve months|three outcomes/i,
    '- Reposition the brand for mid-market\n- Double marketing-sourced pipeline\n- Hire a head of product marketing',
  ],
  [
    /30 days|day 30/i,
    'Met every exec and our top ten customers; a written diagnosis of the funnel',
  ],
  [/day 90/i, 'Pipeline plan approved by the board — measured by sourced pipeline'],
  [
    /disagree|hardest conversation/i,
    'The CRO will push for short-term leads over brand. The CEO decides.',
  ],
  [/compromise|screen on/i, 'Has led a B2B repositioning; has run a team of 20 or more'],
  [/team they inherit|report into marketing/i, 'A team of 14 marketers.'],
  [/currency|which country/i, 'New York, paid in US dollars.'],
  [/compensation range|low and high/i, '$380k to $450k base.'],
  [
    /finalists|people involved/i,
    'CEO: vision and pace\nCRO: pipeline partnership\nBoard member: strategic judgement',
  ],
  [/fail|worries you/i, 'Budget is flat this year. Sales is sceptical of marketing.'],
];

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

const progress = (page: Page) => page.getByText(/^Question \d+ of 15$/);

async function questionNumber(page: Page) {
  return Number((await progress(page).textContent())!.match(/Question (\d+)/)![1]);
}

/** Answer the open question; wait for the next one (or the finished state). */
async function answerOne(page: Page) {
  const heading = page.getByRole('heading', { level: 1 });
  const question = (await heading.textContent()) ?? '';
  const answer = answersByCue.find(([re]) => re.test(question))?.[1];
  expect(answer, `no scripted answer for: ${question}`).toBeTruthy();
  const before = await questionNumber(page);
  const box = page.getByRole('textbox');
  await box.fill(answer!);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByText(`Question ${before + 1} of 15`).or(page.getByText('That is everything I need.')),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page
      .getByRole('button', { name: 'Continue' })
      .or(page.getByRole('button', { name: 'Draft my mandate' }))
      .first(),
  ).toBeVisible();
  if (await box.isVisible()) await expect(box).toBeEnabled();
}

test('an employer builds, resumes, confirms and exports a mandate', async ({ page }) => {
  test.setTimeout(180_000);
  await signInAs(page, 'employer@sample.cmobeat.dev');
  await page.goto('/employer/mandates/new');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Before you hire, define the seat.',
  );
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Begin session' }).click();
  await page.waitForURL(/\/employer\/mandates\/session\/[0-9a-f-]{36}$/);

  // The Session View: Iris, one question, mono metadata.
  await expect(progress(page)).toHaveText('Question 1 of 15');
  await expect(page.getByRole('img', { name: /Assistant/ })).toBeVisible();
  await expect(page.getByText('Encrypted')).toBeVisible();
  await expectAccessible(page);

  for (let i = 0; i < 3; i++) await answerOne(page);
  const atReload = await questionNumber(page);
  const questionBefore = await page.getByRole('heading', { level: 1 }).textContent();

  // Reload mid-session: it resumes on the same question.
  await page.reload();
  await expect(progress(page)).toHaveText(`Question ${atReload} of 15`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(questionBefore!);

  for (let i = 0; i < 20; i++) {
    if (await page.getByText('That is everything I need.').isVisible()) break;
    await answerOne(page);
  }
  await expect(page.getByText('That is everything I need.')).toBeVisible();
  await page.getByRole('button', { name: 'Draft my mandate' }).click();
  await page.waitForURL(/\/employer\/mandates\/[0-9a-f-]{36}$/);
  const mandateUrl = page.url();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chief Marketing Officer');
  await expect(page.getByText('Drafted from your session · not confirmed')).toBeVisible();
  await expect(page.getByText(/Benchmark · computed from listings, not AI/)).toBeVisible();
  await expectAccessible(page);

  // Edit, save, confirm (the amber human decision).
  await page.getByLabel('Title').fill('Chief Marketing Officer, North America');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved. Confirm again when you are ready.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Chief Marketing Officer, North America',
  );
  await page.getByRole('button', { name: 'Confirm mandate' }).click();
  await expect(page.getByText('Confirmed. This mandate is ready to use.')).toBeVisible();
  await expect(page.getByText('Confirmed by you')).toBeVisible();

  // Export the PDF.
  const pdf = await page.request.get(
    `${mandateUrl.replace(/\/employer\/mandates\//, '/api/mandates/')}/pdf`,
  );
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).byteLength).toBeGreaterThan(5000);

  // It is listed, confirmed.
  await page.goto('/employer/mandates');
  await expect(
    page.getByRole('link', { name: /Chief Marketing Officer, North America/ }).first(),
  ).toBeVisible();
});

test('another user cannot open someone else’s session', async ({ page, browser }) => {
  await signInAs(page, 'employer@sample.cmobeat.dev');
  const res = await page.request.post('/api/sessions', { data: { kind: 'mandate' } });
  expect(res.status()).toBe(201);
  const { data } = (await res.json()) as { data: { id: string } };

  const other = await browser.newContext();
  const p2 = await other.newPage();
  await signInAs(p2, 'admin@sample.cmobeat.dev');
  expect((await p2.request.get(`/api/sessions/${data.id}`)).status()).toBe(404);
  await other.close();
});
