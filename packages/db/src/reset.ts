import postgres from 'postgres';
import { closeDb } from './client';
import { loadRootEnv } from './env';
import { runMigrations } from './migrate';

/**
 * Drops and rebuilds the database schema, ensures the app login role exists, then (optionally) seeds.
 * Development and test only.
 */
export async function resetDatabase(opts: { seed?: () => Promise<unknown> } = {}): Promise<void> {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to reset a production database');
  const url = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  if (!url || !appUrl) throw new Error('DATABASE_URL and APP_DATABASE_URL must be set');

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(`
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      DROP SCHEMA IF EXISTS app CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
    `);
    await ensureAppLoginRole(sql, appUrl);
  } finally {
    await sql.end();
  }
  await runMigrations();
  if (opts.seed) await opts.seed();
}

/**
 * Create (or update) the LOGIN role named in APP_DATABASE_URL and grant it app_user.
 * Roles are cluster-wide, and several test suites reset their own databases in parallel, so
 * this tolerates a concurrent create and retries on "tuple concurrently updated".
 */
async function ensureAppLoginRole(sql: postgres.Sql, appUrl: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await ensureAppLoginRoleOnce(sql, appUrl);
    } catch (e) {
      const code = (e as { code?: string }).code;
      const retryable =
        code === 'XX000' || code === '42710' || code === '23505' || code === '40001';
      if (!retryable || attempt >= 6) throw e;
      await new Promise((r) => setTimeout(r, 50 * attempt + Math.random() * 100));
    }
  }
}

async function ensureAppLoginRoleOnce(sql: postgres.Sql, appUrl: string): Promise<void> {
  const u = new URL(appUrl);
  const name = decodeURIComponent(u.username);
  const password = decodeURIComponent(u.password);
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unsafe role name: ${name}`);
  await sql.unsafe(`
    DO $$ BEGIN
      BEGIN
        CREATE ROLE app_user NOLOGIN NOINHERIT NOBYPASSRLS;
      EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
      END;
      BEGIN
        CREATE ROLE ${name} LOGIN INHERIT NOBYPASSRLS;
      EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
      END;
    END $$;
  `);
  await sql.unsafe(
    `ALTER ROLE ${name} WITH LOGIN INHERIT NOBYPASSRLS NOSUPERUSER PASSWORD ${quoteLiteral(password)}`,
  );
  await sql.unsafe(`GRANT app_user TO ${name}`);
  await sql.unsafe(
    `GRANT CONNECT ON DATABASE ${quoteIdent(new URL(process.env.DATABASE_URL!).pathname.slice(1))} TO ${name}`,
  );
}

const quoteLiteral = (s: string) => `'${s.replace(/'/g, "''")}'`;
const quoteIdent = (s: string) => `"${s.replace(/"/g, '""')}"`;

if (import.meta.url === `file://${process.argv[1]}`) {
  loadRootEnv();
  const skipSeed = process.argv.includes('--no-seed');
  (async () => {
    const { seed } = await import('./seed/index');
    await resetDatabase({ seed: skipSeed ? undefined : () => seed() });
    console.log(skipSeed ? 'Database reset.' : 'Database reset and seeded.');
  })()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
