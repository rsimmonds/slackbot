import postgres from 'postgres';
import { adminUrl, webTestEnv } from './env';

/** Creates the web test database if needed, then migrates and seeds it once per run. */
export default async function setup() {
  Object.assign(process.env, webTestEnv);
  const dbName = new URL(webTestEnv.DATABASE_URL).pathname.slice(1);
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    const exists = await admin`select 1 from pg_database where datname = ${dbName}`;
    if (exists.length === 0) await admin.unsafe(`create database "${dbName.replace(/"/g, '')}"`);
  } finally {
    await admin.end();
  }
  const { resetDatabase } = await import('../../../packages/db/src/reset');
  const { seed } = await import('../../../packages/db/src/seed/index');
  const { closeDb } = await import('@cmobeat/db');
  await resetDatabase({ seed: () => seed() });
  await closeDb();
}
