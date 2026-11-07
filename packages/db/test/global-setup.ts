import { testEnv } from './env';

export default async function setup() {
  Object.assign(process.env, testEnv);
  const { resetDatabase } = await import('../src/reset');
  const { seed } = await import('../src/seed/index');
  const { adminDb, closeDb } = await import('../src/client');
  const { createFixture } = await import('./fixture');
  await resetDatabase({ seed: () => seed() });
  await createFixture(adminDb());
  await closeDb();
}
