import { currencies, markets } from '@cmobeat/config';
import { z } from 'zod';

/**
 * Job search filters. URL-driven so every search is shareable and can be saved as-is.
 * Comp filtering never converts between currencies: a minimum applies within one currency.
 */
export const levels = ['cmo', 'vp_marketing', 'chief_growth_officer', 'fractional_cmo'] as const;
export const workTypes = ['full_time', 'fractional'] as const;

/** Function scope is derived from mandate scope and priorities by keyword. */
export const functionScopes = {
  brand: ['brand', 'position', 'story', 'narrative', 'creative'],
  demand: ['demand', 'pipeline', 'acquisition', 'paid', 'performance'],
  product_marketing: ['product marketing', 'pmm', 'launch', 'pricing', 'packaging'],
  growth: ['growth', 'retention', 'lifecycle', 'expansion', 'plg'],
  communications: ['communications', 'comms', 'pr', 'analyst', 'press'],
} as const;
export type FunctionScope = keyof typeof functionScopes;

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), z.enum(values).optional());

const optionalText = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : undefined),
  z.string().optional(),
);

export const filtersSchema = z.object({
  q: optionalText,
  level: optionalEnum(levels),
  scope: optionalEnum(Object.keys(functionScopes) as [FunctionScope, ...FunctionScope[]]),
  stage: optionalText,
  industry: optionalText,
  market: optionalEnum(markets),
  remote: z.preprocess(
    (v) => (v === '1' || v === 'true' || v === true ? true : undefined),
    z.literal(true).optional(),
  ),
  work: optionalEnum(workTypes),
  currency: optionalEnum(currencies),
  /** Minimum comp in whole currency units, within `currency`. */
  minComp: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : Number(v)),
    z.number().int().positive().max(10_000_000).optional(),
  ),
  page: z.preprocess(
    (v) => (v === undefined || v === '' ? 1 : Number(v)),
    z.number().int().min(1).max(500),
  ),
});

export type JobFilters = z.infer<typeof filtersSchema>;

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

export function parseFilters(params: Params): JobFilters {
  const obj: Record<string, string | undefined> =
    params instanceof URLSearchParams
      ? Object.fromEntries(params.entries())
      : Object.fromEntries(
          Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
        );
  const parsed = filtersSchema.safeParse(obj);
  if (parsed.success) return parsed.data;
  // Drop only the invalid keys, keep the rest.
  const bad = new Set(parsed.error.issues.map((i) => String(i.path[0])));
  return filtersSchema.parse(Object.fromEntries(Object.entries(obj).filter(([k]) => !bad.has(k))));
}

/** Serialise filters back to a query string. Omits page 1 and empty values. */
export function toQuery(filters: Partial<JobFilters>, overrides: Partial<JobFilters> = {}): string {
  const merged = { ...filters, ...overrides };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null || v === '') continue;
    if (k === 'page' && v === 1) continue;
    sp.set(k, v === true ? '1' : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** The filters worth saving (page excluded). */
export function savedQuery(filters: JobFilters): Omit<JobFilters, 'page'> {
  return Object.fromEntries(
    Object.entries(filters).filter(([k, v]) => k !== 'page' && v !== undefined),
  ) as Omit<JobFilters, 'page'>;
}

export const hasFilters = (f: JobFilters) => Object.keys(savedQuery(f)).length > 0;
