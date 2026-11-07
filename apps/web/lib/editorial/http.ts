import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { EditorialError, httpStatus } from './access';

/** Turns expected failures into JSON errors. Anything else is a 500 with no detail leaked. */
export async function jsonHandler(
  fn: () => Promise<unknown>,
  init?: { status?: number },
): Promise<Response> {
  try {
    const data = await fn();
    return NextResponse.json({ data }, { status: init?.status ?? 200 });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'invalid',
          issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
        { status: 422 },
      );
    }
    if (e instanceof EditorialError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: httpStatus[e.code] },
      );
    }
    const code = (e as { cause?: { code?: string } })?.cause?.code;
    if (code === '42501') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (code === '23514')
      return NextResponse.json(
        { error: 'invalid', message: 'That change breaks a publishing rule.' },
        { status: 422 },
      );
    console.error(e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

/**
 * State-changing requests must be JSON. Cross-site forms can't send application/json without a
 * CORS preflight, which we never grant, so this doubles as CSRF protection alongside SameSite cookies.
 */
export async function readJson(req: Request): Promise<unknown> {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new EditorialError('invalid', 'Send JSON.');
  }
  try {
    return await req.json();
  } catch {
    throw new EditorialError('invalid', 'Malformed JSON.');
  }
}

export const searchParamsObject = (req: Request) =>
  Object.fromEntries(new URL(req.url).searchParams);

export const uuidParam = (id: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new EditorialError('not_found', 'Not found.');
  }
  return id;
};
