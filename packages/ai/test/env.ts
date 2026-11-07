/**
 * The AI package tests get their own database (<test db>_ai) so they never race the db package's
 * tests, which reset the shared test database. The key is a fixed public test value.
 */
const base =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cmobeat_test';
const appBase =
  process.env.TEST_APP_DATABASE_URL ??
  'postgres://cmobeat_app:cmobeat_app@localhost:5432/cmobeat_test';
const withSuffix = (url: string) => {
  const u = new URL(url);
  u.pathname = `${u.pathname}_ai`;
  return u.toString();
};

export const testEnv = {
  DATABASE_URL: withSuffix(base),
  APP_DATABASE_URL: withSuffix(appBase),
  ENCRYPTION_MASTER_KEY: 'dGVzdC1vbmx5LWtleS1ub3QtYS1zZWNyZXQtMDAwMDA=',
  NODE_ENV: 'test',
  AI_PROVIDER: 'fake',
  ANTHROPIC_API_KEY: '',
};
