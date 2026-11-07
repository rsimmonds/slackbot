import { currencies, markets } from '@cmobeat/config';
import { z } from 'zod';

/** Shared by the API, the exports and the OpenAPI document, so they never drift. */
export const moveTypes = ['appointed', 'departed', 'promoted'] as const;
export const levels = ['vp_marketing', 'cmo', 'chief_growth_officer', 'fractional_cmo'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const limitParam = z.coerce.number().int().min(1).max(200).default(50);
export const cursorParam = z.string().max(400).optional();

export const moveFiltersSchema = z.object({
  type: z.enum(moveTypes).optional(),
  industry: z.string().trim().min(1).max(80).optional(),
  market: z.enum(markets).optional(),
  company: z.string().trim().min(1).max(120).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: limitParam,
  cursor: cursorParam,
});
export type MoveQuery = z.infer<typeof moveFiltersSchema>;

export const listingFiltersSchema = z.object({
  level: z.enum(levels).optional(),
  market: z.enum(markets).optional(),
  work_type: z.enum(['full_time', 'fractional']).optional(),
  limit: limitParam,
  cursor: cursorParam,
});
export type ListingQuery = z.infer<typeof listingFiltersSchema>;

export const compFiltersSchema = z.object({
  level: z.enum(levels).optional(),
  market: z.enum(markets).optional(),
  currency: z.enum(currencies).optional(),
});
export type CompQuery = z.infer<typeof compFiltersSchema>;

export const companyFiltersSchema = z.object({
  industry: z.string().trim().min(1).max(80).optional(),
  market: z.enum(markets).optional(),
  limit: limitParam,
  cursor: cursorParam,
});
export type CompanyQuery = z.infer<typeof companyFiltersSchema>;

/** Query string → plain object (last value wins). */
export const queryObject = (url: URL) => Object.fromEntries(url.searchParams.entries());

export class InvalidCursorError extends Error {
  constructor() {
    super('The cursor is not valid. Start again without it.');
  }
}

/** Opaque cursor: base64url of a JSON tuple. Tampered cursors are rejected, not trusted. */
export function encodeCursor(parts: string[]): string {
  return Buffer.from(JSON.stringify(parts)).toString('base64url');
}

export function decodeCursor(cursor: string | undefined, length: number): string[] | null {
  if (!cursor) return null;
  try {
    const v: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(v) && v.length === length && v.every((x) => typeof x === 'string'))
      return v as string[];
  } catch {
    /* fall through */
  }
  throw new InvalidCursorError();
}

/** Minimum comparable listings before a comp cell's figures are published. */
export const MIN_CELL = 5;

export const licence =
  'CMO Beat data licence (draft, pending legal review): internal analysis by the subscribing company only. No resale or redistribution. Cite "CMO Beat" when quoting.';
