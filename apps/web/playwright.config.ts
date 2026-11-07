import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 3100);

/**
 * End-to-end tests publish, pay and delete things, so they run against their own database
 * (`<db>_e2e`), reset before every run. The dev database is never touched. Set here, in the
 * runner process, so the app server and every test helper inherit it.
 */
const rootEnv = new URL('../../.env', import.meta.url).pathname;
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const e2eDb = (url: string) => {
  const u = new URL(url);
  if (!u.pathname.endsWith('_e2e')) u.pathname = `${u.pathname}_e2e`;
  return u.toString();
};
process.env.DATABASE_URL = e2eDb(
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cmobeat',
);
process.env.APP_DATABASE_URL = e2eDb(
  process.env.APP_DATABASE_URL ?? 'postgres://cmobeat_app:cmobeat_app@localhost:5432/cmobeat',
);

// Create and reset the e2e database once per run, before the app server starts (Playwright
// starts the web server before globalSetup, so this can't live there). Workers inherit the flag.
if (!process.env.E2E_DB_READY) {
  const name = new URL(process.env.DATABASE_URL).pathname.slice(1);
  if (!/^[a-z0-9_]+_e2e$/.test(name))
    throw new Error(`Refusing to reset non-e2e database: ${name}`);
  const admin = new URL(process.env.DATABASE_URL);
  admin.pathname = '/postgres';
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import postgres from 'postgres';
       const sql = postgres(process.argv[1], { max: 1, onnotice: () => {} });
       const [e] = await sql\`select 1 from pg_database where datname = \${process.argv[2]}\`;
       if (!e) await sql.unsafe('create database "' + process.argv[2] + '"');
       await sql.end();`,
      admin.toString(),
      name,
    ],
    { cwd: new URL('.', import.meta.url).pathname, stdio: 'pipe' },
  );
  execFileSync('pnpm', ['--filter', '@cmobeat/db', 'reset'], {
    cwd: new URL('../../', import.meta.url).pathname,
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'development' },
  });
  process.env.E2E_DB_READY = '1';
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'off',
    // Every test starts with analytics declined, so the consent banner never covers the page.
    // compliance.spec.ts clears this to test the banner itself.
    storageState: './e2e/consent-declined.json',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `pnpm exec next start --port ${port}`,
    url: `http://localhost:${port}`,
    // Never reuse a dev server: it would be pointed at the dev database.
    reuseExistingServer: false,
    env: {
      ALLOW_DEV_AUTH_IN_PRODUCTION: 'true',
      INTERVIEW_STREAM_DELAY_MS: '0',
      DATABASE_URL: process.env.DATABASE_URL,
      APP_DATABASE_URL: process.env.APP_DATABASE_URL,
    },
    timeout: 120_000,
  },
});
