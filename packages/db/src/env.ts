import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/** Load the repo-root .env for CLI scripts (Next.js loads it itself for the app). */
export function loadRootEnv(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  for (const f of ['.env.local', '.env']) {
    const p = resolve(root, f);
    if (existsSync(p)) process.loadEnvFile(p);
  }
}
