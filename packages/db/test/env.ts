/** Test-only settings. The key is a fixed public test value, not a secret. */
export const testEnv = {
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cmobeat_test',
  APP_DATABASE_URL:
    process.env.TEST_APP_DATABASE_URL ??
    'postgres://cmobeat_app:cmobeat_app@localhost:5432/cmobeat_test',
  ENCRYPTION_MASTER_KEY: 'dGVzdC1vbmx5LWtleS1ub3QtYS1zZWNyZXQtMDAwMDA=',
  NODE_ENV: 'test',
};
