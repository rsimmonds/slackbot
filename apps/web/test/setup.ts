import { afterAll, vi } from 'vitest';
import { webTestEnv } from './env';

Object.assign(process.env, webTestEnv);

/**
 * Tests sign in by setting the current viewer. Everything below the auth layer (RLS, triggers,
 * webhooks) runs for real against Postgres.
 */
const state = vi.hoisted(() => ({
  viewer: null as null | { id: string; email: string; name: string; roles: string[] },
}));
export const testAuth = state;

vi.mock('@/lib/auth', () => ({
  getViewer: async () => state.viewer,
  requireArea: async () => {
    if (!state.viewer) throw new Error('not signed in');
    return state.viewer;
  },
  authMode: () => 'dev',
}));

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

afterAll(async () => {
  const { closeDb } = await import('@cmobeat/db');
  await closeDb();
});
