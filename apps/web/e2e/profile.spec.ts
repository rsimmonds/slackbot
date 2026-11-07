import { existsSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { makePdf } from '../test/make-pdf';

/**
 * Phase 2 acceptance (profile side): a candidate reads the AI notice, uploads a résumé, approves
 * a drafted profile line by line, sets visibility to hidden, and no other role can see it.
 * The interview itself is the SESSIONS workstream; here a finished session is seeded directly,
 * encrypted exactly as the engine stores it.
 */
for (const f of ['../../.env', '.env'])
  if (existsSync(f) && !process.env.DATABASE_URL) process.loadEnvFile(f);

test.describe.configure({ mode: 'serial' });

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
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
}

async function seedFinishedSession(): Promise<string> {
  const { createProfileSession } = await import('../test/profile-fixtures');
  const { devUsers } = await import('@cmobeat/db/dev-users');
  const { closeDb } = await import('@cmobeat/db');
  const id = await createProfileSession(
    devUsers.find((u) => u.email === 'candidate@sample.cmobeat.dev')!.id,
  );
  await closeDb();
  return id;
}

test('candidate reads the AI notice and uploads a résumé, encrypted and scrubbed', async ({
  page,
}) => {
  await signInAs(page, 'candidate@sample.cmobeat.dev');
  await page.goto('/me/profile/start');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Before we begin.');
  await expect(page.getByRole('link', { name: 'Read the full AI notice' })).toHaveAttribute(
    'href',
    '/legal/ai',
  );

  const ack = page.getByRole('button', { name: 'I have read this' });
  if (await ack.isVisible()) await ack.click();
  await expect(page.getByText(/Read and acknowledged/)).toBeVisible();

  await page.getByLabel('Résumé').setInputFiles({
    name: 'resume.pdf',
    mimeType: 'application/pdf',
    buffer: makePdf([
      'Jordan Example',
      'jordan@example.com',
      'CMO, grew ARR from $8M to $20M in two years.',
      'I am 52 years old.',
    ]),
  });
  await expect(
    page.getByRole('status').filter({ hasText: 'Uploaded and encrypted' }),
  ).toContainText('age');
  await expect(page.getByRole('link', { name: 'Download your copy' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Begin interview' })).toBeEnabled();
  await expectAccessible(page);

  // A file that isn't a PDF is refused.
  await page.getByLabel('LinkedIn profile (PDF export)').setInputFiles({
    name: 'linkedin.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('not really a pdf'),
  });
  await expect(page.getByRole('alert').filter({ hasText: 'Upload a PDF' })).toBeVisible();
});

test('candidate approves every line before the profile is saved', async ({ page }) => {
  const sessionId = await seedFinishedSession();
  await signInAs(page, 'candidate@sample.cmobeat.dev');
  await page.goto(`/me/profile/review?session=${sessionId}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Approve every line.');
  await expect(page.getByText(/mentioned age/)).toBeVisible();

  const save = page.getByRole('button', { name: 'Save my profile' });
  await expect(save).toBeDisabled();

  // Edit the headline, remove one result, approve the rest.
  const headline = page.getByRole('listitem', { name: 'Headline' });
  await headline.getByRole('button', { name: 'Edit' }).click();
  await headline
    .getByLabel('Edit headline')
    .fill('CMO for growth-stage B2B software that needs demand rebuilt');
  await page.locator('[data-line="outcome:2"]').getByRole('button', { name: 'Remove' }).click();
  await expect(save).toBeDisabled();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Approve the rest' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Every line has a decision.' }),
  ).toBeVisible();
  await save.click();

  await page.waitForURL(/\/me\/visibility\?saved=1/);
  await expect(page.getByText('Profile saved')).toBeVisible();
});

test('widening visibility needs consent; hidden is instant; the profile is visible to no one', async ({
  page,
}) => {
  await signInAs(page, 'candidate@sample.cmobeat.dev');
  await page.goto('/me/visibility');

  await page.getByRole('radio', { name: /Anonymous matching only/ }).click();
  const gate = page.getByRole('dialog');
  await expect(gate).toContainText('CMO Beat talent partners');
  const consent = gate.getByRole('button', { name: 'I consent' });
  await expect(consent).toBeDisabled();
  await gate.getByRole('checkbox').click();
  await consent.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You decide who sees it.');

  await page.getByRole('radio', { name: /^Hidden/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Your profile is visible to no one.',
  );
  await expect(page.getByRole('list', { name: 'Blocked companies' })).toContainText(
    'Current employer · always blocked',
  );
  await expectAccessible(page);

  await page.goto('/me');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Your profile is visible to no one.',
  );
});

for (const who of ['employer', 'talent', 'admin', 'editor', 'reader'] as const) {
  test(`${who} cannot see the candidate's profile anywhere`, async ({ page }) => {
    await signInAs(page, `${who}@sample.cmobeat.dev`);
    await page.goto('/me/visibility');
    await expect(page).not.toHaveURL(/\/me\//);
    for (const path of ['/api/profiles', '/api/profiles/blocklist', '/api/profiles/uploads']) {
      const res = await page.request.get(path);
      expect([401, 403]).toContain(res.status());
      expect(await res.text()).not.toMatch(/growth-stage B2B|Jordan|candidate@/);
    }
  });
}

test('anyone can request an export, and a deletion can be cancelled in the grace window', async ({
  page,
}) => {
  await signInAs(page, 'reader@sample.cmobeat.dev');
  await page.goto('/account/data');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your data, on your terms.');
  const request = page.getByRole('button', { name: 'Request a copy of my data' });
  if (await request.isVisible()) await request.click();
  await expect(page.getByText('Preparing your export')).toBeVisible();
  await expectAccessible(page);

  const del = page.getByRole('button', { name: 'Delete my account' });
  await expect(del).toBeDisabled();
  await page.getByLabel('Type “delete” to confirm').fill('delete');
  await del.click();
  await page.waitForURL((u) => u.pathname === '/');

  // Signed out; sign back in during the grace window and keep the account.
  await signInAs(page, 'reader@sample.cmobeat.dev');
  await page.goto('/account/data');
  await expect(page.getByText(/Deletion requested/)).toBeVisible();
  await page.getByRole('button', { name: 'Keep my account' }).click();
  await expect(page.getByRole('button', { name: 'Delete my account' })).toBeVisible();
});
