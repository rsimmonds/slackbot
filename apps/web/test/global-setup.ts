import postgres from 'postgres';
import { testEnv } from './env';

/** Creates the web test database if needed, then resets and seeds it once per run. */
export default async function setup() {
  Object.assign(process.env, testEnv);
  const url = new URL(testEnv.DATABASE_URL);
  const dbName = url.pathname.slice(1);
  const adminUrl = new URL(testEnv.DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const sql = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    const [exists] = await sql`select 1 from pg_database where datname = ${dbName}`;
    if (!exists) await sql.unsafe(`create database "${dbName.replace(/"/g, '')}"`);
  } finally {
    await sql.end();
  }
  // Relative imports: these are dev/test utilities of the db package, not part of its public API.
  const { resetDatabase } = await import('../../../packages/db/src/reset');
  const { seed } = await import('../../../packages/db/src/seed/index');
  const { closeDb } = await import('@cmobeat/db');
  await resetDatabase({ seed: () => seed() });
  await closeDb();
}
