import { expect } from 'vitest';
import type { Role } from '@cmobeat/config';
import { withUser, type Tx } from '../src/client';

export const as = <T>(userId: string, roles: Role[], fn: (tx: Tx) => Promise<T>) =>
  withUser({ userId, roles }, fn);

/** Postgres SQLSTATE of a failed query (drizzle wraps the driver error in `cause`). */
export function pgCode(e: unknown): string | undefined {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.cause?.code ?? err?.code;
}

export async function expectPgError(p: Promise<unknown>, code: string): Promise<void> {
  let caught: unknown;
  try {
    await p;
  } catch (e) {
    caught = e;
  }
  expect(caught, `expected SQLSTATE ${code}`).toBeDefined();
  expect(pgCode(caught)).toBe(code);
}

export const INSUFFICIENT_PRIVILEGE = '42501';
export const CHECK_VIOLATION = '23514';
