import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { adminDb, closeDb } from './client';
import { loadRootEnv } from './env';

export const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle');

export async function runMigrations(): Promise<void> {
  await migrate(adminDb(), { migrationsFolder });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadRootEnv();
  runMigrations()
    .then(() => console.log('Migrations applied.'))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
