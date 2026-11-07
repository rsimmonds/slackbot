import 'server-only';
import { withAnon, withUser, type Tx } from '@cmobeat/db';
import type { Viewer } from './auth';

/**
 * Run queries as the person making the request, so Postgres row-level security applies.
 * Signed-out visitors run as anonymous and see public content only.
 * Never use adminDb() to serve a user request.
 */
export function asViewer<T>(viewer: Viewer | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return viewer ? withUser({ userId: viewer.id, roles: viewer.roles }, fn) : withAnon(fn);
}
