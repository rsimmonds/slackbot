import { markets } from '@cmobeat/config';
import { z } from 'zod';
import type { MoveFilters } from './queries';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const schema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  type: z.enum(['appointed', 'departed', 'promoted']).optional().catch(undefined),
  industry: z.string().trim().max(80).optional().catch(undefined),
  market: z.enum(markets).optional().catch(undefined),
  company: z.uuid().optional().catch(undefined),
  from: date.optional().catch(undefined),
  to: date.optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).optional().catch(undefined),
});

type Raw = Record<string, string | string[] | undefined>;

/** Parses /moves search params. Anything malformed is dropped, never an error page. */
export function parseMoveFilters(raw: Raw): { filters: MoveFilters; page: number } {
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v === '' ? undefined : v]),
  );
  const { page, ...filters } = schema.parse(flat);
  const clean = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined),
  ) as MoveFilters;
  return { filters: clean, page: page ?? 1 };
}

export function movesHref(filters: MoveFilters, page?: number): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) p.set(k, String(v));
  if (page && page > 1) p.set('page', String(page));
  const s = p.toString();
  return s ? `/moves?${s}` : '/moves';
}
