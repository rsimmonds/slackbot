import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError, type z } from 'zod';
import { PostingError } from './jobs/posting';

/** Parse a JSON body against a schema. Throws a 400-mapped error on bad input. */
export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new PostingError('Body must be JSON.', 400);
  }
  return schema.parse(body);
}

/** Map known errors to JSON responses; rethrow anything unexpected. */
export function apiError(e: unknown) {
  if (e instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Invalid input',
        issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 },
    );
  }
  if (e instanceof PostingError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
