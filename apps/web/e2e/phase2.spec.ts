import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 2 acceptance, end to end across the interview engine and candidate privacy:
 * a candidate completes a profile interview (offline provider), approves every line,
 * keeps the profile hidden, and no other role can see it.
 */

const answersByCue: [RegExp, string][] = [
  [
    /current or most recent role|title, and roughly/i,
    'I am the Chief Marketing Officer at a Series C fintech, and I have led marketing for 14 years.',
  ],
  [/proudest/i, 'Grew annual recurring revenue from $12M to $40M over three years.'],
  [
    /pipeline or demand|sourced pipeline, qualified/i,
    'Marketing-sourced pipeline went from 18% to 46% of total pipeline in two years.',
  ],
  [
    /brand or positioning|evidence showed it worked/i,
    'We repositioned for mid-market. Win rate rose from 19% to 31% in 18 months.',
  ],
  [/more efficient|CAC|payback/i, 'Cut CAC payback from 22 months to 14 months in one year.'],
  [
    /teams have you built|size and how long/i,
    'Built a 40-person marketing team from 6 people in two years.',
  ],
  [
    /use AI|workflow/i,
    'We use Claude to draft and test landing page variants each week. A person reviews every variant before it ships.',
  ],
  [/one line|leader you are/i, 'CMO who rebuilds demand engines at growth-stage B2B companies.'],
  [
    /next mandate|hired to solve|first year/i,
    'A CMO seat at a growth-stage B2B software company that needs its demand engine rebuilt and a clear category story.',
  ],
  [/stages and industries/i, 'Series B to D. Fintech and B2B infrastructure software.'],
  [/Full-time, fractional|which markets/i, 'Full-time, in the US or Canada.'],
  [/report to/i, 'The CEO.'],
  [/turn down/i, 'No budget to build a team. Reporting to the CRO.'],
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

const done = (page: Page) => page.getByText('That is everything I need.');

async function answerOne(page: Page) {
  const question = (await page.getByRole('heading', { level: 1 }).textContent()) ?? '';
  const answer = answersByCue.find(([re]) => re.test(question))?.[1];
  expect(answer, `no scripted answer for: ${question}`).toBeTruthy();
  const before = Number(
    (await page.getByText(/^Question \d+ of 15$/).textContent())!.match(/(\d+)/)![1],
  );
  await page.getByRole('textbox').fill(answer!);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(`Question ${before + 1} of 15`).or(done(page))).toBeVisible({
    timeout: 15_000,
  });
}

test('a candidate completes a profile interview, approves it, and it stays hidden', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signInAs(page, 'candidate@sample.cmobeat.dev');
  await page.goto('/me/profile/start');
  // The interview stays locked until the candidate acknowledges the AI notice. The
  // acknowledgement is saved, so a later run (or the other device project) starts unlocked.
  const begin = page.getByRole('button', { name: 'Begin interview' });
  const ack = page.getByRole('button', { name: 'I have read this' });
  if (await ack.isVisible()) {
    await expect(begin).toBeDisabled();
    await ack.click();
  }
  await expect(begin).toBeEnabled();
  await begin.click();
  await page.waitForURL(/\/me\/interview\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Question 1 of 15')).toBeVisible();
  await expect(page.getByText('Encrypted', { exact: true }).first()).toBeVisible();
  await expectAccessible(page);

  for (let i = 0; i < 20 && !(await done(page).isVisible()); i++) await answerOne(page);
  await expect(done(page)).toBeVisible();
  await page.getByRole('button', { name: 'Draft my profile' }).click();

  await page.waitForURL(/\/me\/profile\/review\?session=/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Approve every line.');
  await expect(page.getByText('$12M to $40M').first()).toBeVisible();
  await page.getByRole('button', { name: 'Approve the rest' }).click();
  await page.getByRole('button', { name: 'Save my profile' }).click();
  await page.waitForURL(/\/me\/visibility\?saved=1/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Your profile is visible to no one.',
  );

  // Every other role: no route or API reveals the profile.
  for (const who of ['employer', 'talent', 'admin', 'editor', 'reader']) {
    await page.context().clearCookies();
    await signInAs(page, `${who}@sample.cmobeat.dev`);
    for (const path of ['/api/profiles', '/api/profiles/blocklist', '/api/profiles/uploads']) {
      const res = await page.request.get(path);
      expect([401, 403]).toContain(res.status());
      expect(await res.text()).not.toMatch(/demand engines|\$12M|candidate@/);
    }
  }
});
