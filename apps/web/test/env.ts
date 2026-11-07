/**
 * Web integration tests use their own database, `<test db>_web`, so they never race the db
 * package's tests (Turbo runs packages in parallel). The key is a fixed public test value.
 */
const base =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cmobeat_test';
const appBase =
  process.env.TEST_APP_DATABASE_URL ??
  'postgres://cmobeat_app:cmobeat_app@localhost:5432/cmobeat_test';

const withSuffix = (url: string) => {
  const u = new URL(url);
  u.pathname = `${u.pathname}_web`;
  return u.toString();
};

export const webTestEnv = {
  DATABASE_URL: withSuffix(base),
  APP_DATABASE_URL: withSuffix(appBase),
  ENCRYPTION_MASTER_KEY: 'dGVzdC1vbmx5LWtleS1ub3QtYS1zZWNyZXQtMDAwMDA=',
  EMAIL_PROVIDER: 'outbox',
  SITE_URL: 'https://cmobeat.test',
  AUTH_MODE: 'dev',
  DEV_AUTH_SECRET: 'test-only-dev-auth-secret-not-a-real-secret',
  NODE_ENV: 'test' as const,
};

export const adminUrl = (() => {
  const u = new URL(base);
  u.pathname = '/postgres';
  return u.toString();
})();
