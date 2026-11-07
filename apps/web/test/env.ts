/**
 * Web integration tests use their own database (<test db>_web) so they never collide with the
 * packages/db suite when Turbo runs both in parallel. The key is a fixed public test value.
 */
const withSuffix = (url: string) =>
  url.replace(/\/([^/?]+)(\?.*)?$/, (_m, db: string, q = '') => `/${db}_web${q}`);

const base =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cmobeat_test';
const appBase =
  process.env.TEST_APP_DATABASE_URL ??
  'postgres://cmobeat_app:cmobeat_app@localhost:5432/cmobeat_test';

export const testEnv = {
  DATABASE_URL: withSuffix(base),
  APP_DATABASE_URL: withSuffix(appBase),
  ENCRYPTION_MASTER_KEY: 'dGVzdC1vbmx5LWtleS1ub3QtYS1zZWNyZXQtMDAwMDA=',
  AUTH_MODE: 'dev',
  DEV_AUTH_SECRET: 'test-only-dev-auth-secret-not-a-real-secret-000',
  NODE_ENV: 'test' as const,
};
