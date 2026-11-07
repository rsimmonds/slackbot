import 'server-only';
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';

/** Run a billing route: JSON `{ data }` on success, the shared error mapping otherwise. */
export async function handle<T>(fn: () => Promise<T>, status = 200) {
  try {
    return NextResponse.json({ data: await fn() }, { status });
  } catch (e) {
    return apiError(e);
  }
}
