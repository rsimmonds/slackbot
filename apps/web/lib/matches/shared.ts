import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { getViewer, type Viewer } from '@/lib/auth';

/** Errors the matching API maps to HTTP responses. */
export class MatchError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export const isTalent = (v: Viewer) =>
  v.roles.includes('talent_partner') || v.roles.includes('admin');

export function requireTalent(viewer: Viewer | null): Viewer {
  if (!viewer) throw new MatchError('Sign in to continue.', 401);
  if (!isTalent(viewer)) throw new MatchError('Match review is for talent partners.', 403);
  return viewer;
}

export function requireRole(viewer: Viewer | null, role: 'employer' | 'candidate'): Viewer {
  if (!viewer) throw new MatchError('Sign in to continue.', 401);
  if (!viewer.roles.includes(role))
    throw new MatchError(
      role === 'employer' ? 'This is for employers.' : 'This is for candidates.',
      403,
    );
  return viewer;
}

/**
 * The rationale a match carries: a plain-language summary and reasons for and against.
 * Written by the Matcher, editable by a talent partner before approval. Read defensively:
 * older or hand-made rows may only carry a summary.
 */
export const reasonSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  direction: z.enum(['for', 'against']),
});
export const rationaleSchema = z.object({
  summary: z.string().trim().min(3).max(600),
  reasons: z.array(reasonSchema).max(8).default([]),
});
export type Rationale = z.infer<typeof rationaleSchema>;

export function readRationale(raw: unknown): Rationale {
  const r = (raw ?? {}) as { summary?: unknown; reasons?: unknown };
  const reasons = Array.isArray(r.reasons)
    ? r.reasons.flatMap((x) => {
        const p = reasonSchema.safeParse(x);
        return p.success ? [p.data] : [];
      })
    : [];
  return { summary: typeof r.summary === 'string' ? r.summary : '', reasons };
}

/** Which fields changed between two rationales, for the audit log. */
export function rationaleDiff(before: Rationale, after: Rationale) {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  if (before.summary !== after.summary) diff.summary = { from: before.summary, to: after.summary };
  if (JSON.stringify(before.reasons) !== JSON.stringify(after.reasons))
    diff.reasons = { from: before.reasons, to: after.reasons };
  return diff;
}

/**
 * Fit scores are stored as fractions (0–1, enforced by a check constraint) and shown as 0–100.
 * Always a range, never a single verdict.
 */
export const toPercent = (x: unknown) => Math.max(0, Math.min(100, Math.round(Number(x) * 100)));

export const levelLabel: Record<string, string> = {
  vp_marketing: 'VP Marketing',
  cmo: 'CMO',
  chief_growth_officer: 'Chief Growth Officer',
  fractional_cmo: 'Fractional CMO',
};

export const responseLabel: Record<string, string> = {
  pending: 'Not answered',
  interested: 'Interested',
  declined: 'Not for them',
  question: 'Has a question',
};

/** Postgres error code check (RLS denials surface as 42501). */
export function isPgError(e: unknown, code: string): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    if ((cur as { code?: string }).code === code) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/** JSON route wrapper: consistent errors and no caching. */
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
    if (e instanceof MatchError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    if (isPgError(e, '42501'))
      return NextResponse.json({ error: 'You do not have access to this.' }, { status: 403 });
    throw e;
  }
}

export async function viewerOrThrow(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) throw new MatchError('Sign in to continue.', 401);
  return v;
}

export async function readBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new MatchError('Body must be JSON.', 400);
  }
  return schema.parse(json);
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route param as a uuid, or a 404 that never confirms anything exists. */
export async function idParam(ctx: { params: Promise<Record<string, string>> }, key = 'id') {
  const id = (await ctx.params)[key];
  if (!id || !uuid.test(id)) throw new MatchError('Not found.', 404);
  return id;
}

/** Send a notification without ever failing the action that triggered it. */
export async function notify(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    console.error('notification failed', e);
  }
}
