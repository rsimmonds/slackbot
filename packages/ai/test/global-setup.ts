import postgres from 'postgres';
import { testEnv } from './env';

/** Creates the AI test database if needed, then migrates and seeds it fresh. */
export default async function setup() {
  Object.assign(process.env, testEnv);
  const url = new URL(testEnv.DATABASE_URL);
  const dbName = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error(`Unsafe test database name: ${dbName}`);
  const admin = new URL(testEnv.DATABASE_URL);
  admin.pathname = '/postgres';
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    const [exists] = await sql`select 1 from pg_database where datname = ${dbName}`;
    if (!exists) await sql.unsafe(`create database "${dbName}"`);
  } finally {
    await sql.end();
  }
  // Test-only reach into the db package's reset helper (not part of its public API).
  const { resetDatabase } = await import('../../db/src/reset');
  const { seed } = await import('../../db/src/seed/index');
  const { closeDb } = await import('@cmobeat/db');
  await resetDatabase({ seed: () => seed() });
  await closeDb();
}
