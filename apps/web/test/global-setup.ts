import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { webTestEnv } from './env';

/** Create the web test database if needed, then reset, migrate and seed it with the real seed. */
export default async function setup() {
  const target = new URL(webTestEnv.DATABASE_URL);
  const name = target.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Unsafe test database name: ${name}`);
  const admin = new URL(webTestEnv.DATABASE_URL);
  admin.pathname = '/postgres';
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    const [exists] = await sql`select 1 from pg_database where datname = ${name}`;
    if (!exists) await sql.unsafe(`create database "${name}"`);
  } finally {
    await sql.end();
  }
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  execFileSync('pnpm', ['--filter', '@cmobeat/db', 'reset'], {
    cwd: root,
    stdio: 'pipe',
    env: { ...process.env, ...webTestEnv, NODE_ENV: 'development' },
  });
}
