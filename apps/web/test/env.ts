import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Web integration tests use their own database (`<test db>_web`) so they never race the db
 * package's tests, which reset `<test db>` in parallel. Keys here are public test values.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
if (existsSync(`${root}.env`) && !process.env.CI) process.loadEnvFile(`${root}.env`);

const withSuffix = (url: string) => {
  const u = new URL(url);
  u.pathname = `${u.pathname}_web`;
  return u.toString();
};

export const webTestEnv = {
  DATABASE_URL: withSuffix(
    process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cmobeat_test',
  ),
  APP_DATABASE_URL: withSuffix(
    process.env.TEST_APP_DATABASE_URL ??
      'postgres://cmobeat_app:cmobeat_app@localhost:5432/cmobeat_test',
  ),
  ENCRYPTION_MASTER_KEY: 'dGVzdC1vbmx5LWtleS1ub3QtYS1zZWNyZXQtMDAwMDA=',
  DEV_AUTH_SECRET: 'web-test-only-dev-auth-secret-0000000000000000',
  AUTH_MODE: 'dev',
  PAYMENTS_PROVIDER: 'fake',
  EMAIL_PROVIDER: 'outbox',
  APP_URL: 'http://localhost:3000',
  SITE_URL: 'http://localhost:3000',
  NODE_ENV: 'test',
};
