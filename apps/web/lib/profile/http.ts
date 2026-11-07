import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError, type z } from 'zod';
import { getViewer, type Viewer } from '@/lib/auth';
import { ProfileError } from './profile';

/** JSON route wrapper for profile and data-rights APIs: consistent errors, no caching. */
export async function handle(fn: () => Promise<unknown>, status = 200): Promise<Response> {
  try {
    const data = await fn();
    return NextResponse.json({ data }, { status, headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof ZodError)
      return NextResponse.json(
        {
          error: 'Invalid input',
          issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
        { status: 400 },
      );
    if (e instanceof ProfileError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function signedIn(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new ProfileError('Sign in to continue.', 401);
  return viewer;
}

export async function body<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ProfileError('Body must be JSON.', 400);
  }
  return schema.parse(json);
}
