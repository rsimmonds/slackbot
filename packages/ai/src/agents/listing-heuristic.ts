import type { ParsedListing } from '../schemas/listing';

/**
 * Deterministic, offline Listing Parser used when no model is configured (dev, CI, e2e).
 * It is deliberately simple; the Claude-backed parser replaces it whenever a key is present.
 */
export function heuristicParseListing(text: string): ParsedListing {
  const t = text.replace(/\r/g, '');
  const lower = t.toLowerCase();
  const firstLine =
    t
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean) ?? 'Chief Marketing Officer';

  const fractional = /fractional|part[- ]time|retainer|\bdays? (a|per) (week|month)\b/.test(lower);
  const level: ParsedListing['level'] = fractional
    ? 'fractional_cmo'
    : /chief growth officer|\bcgo\b/.test(lower)
      ? 'chief_growth_officer'
      : /\bvp\b|vice president/.test(lower) && !/chief marketing/.test(lower)
        ? 'vp_marketing'
        : 'cmo';

  const currency: ParsedListing['currency'] = /€|\beur\b/.test(lower)
    ? 'EUR'
    : /£|\bgbp\b/.test(lower)
      ? 'GBP'
      : /\bcad\b|c\$/.test(lower)
        ? 'CAD'
        : /\$|\busd\b/.test(lower)
          ? 'USD'
          : null;

  const amount = (raw: string, k?: string) => {
    const n = Number(raw.replace(/,/g, ''));
    return Math.round(k && /k/i.test(k) ? n * 1000 : n);
  };
  const range = t.match(
    /[$€£]?\s?(\d[\d,]*(?:\.\d+)?)\s?(k)?\s?(?:–|-|to)\s?[$€£]?\s?(\d[\d,]*(?:\.\d+)?)\s?(k)?/i,
  );
  let compMin: number | null = null;
  let compMax: number | null = null;
  if (range) {
    compMin = amount(range[1]!, range[2] ?? range[4]);
    compMax = amount(range[3]!, range[4]);
    if (compMin > compMax) [compMin, compMax] = [compMax, compMin];
    if (compMax < 1000) compMin = compMax = null; // not money
  }

  const reports = t.match(/[Rr]eport(?:s|ing)? (?:directly )?to (?:the )?([A-Z][\w &-]{1,40})/);
  const team = lower.match(/team of (\d{1,4})|(\d{1,4})[- ]person team/);
  const priorities = t
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-•*]\s+/.test(l))
    .map((l) => l.replace(/^[-•*]\s+/, ''))
    .slice(0, 6);
  const remote = /\bremote\b/.test(lower);
  const market: ParsedListing['market'] =
    currency === 'EUR'
      ? 'EU'
      : currency === 'GBP'
        ? 'UK'
        : currency === 'CAD'
          ? 'CA'
          : currency === 'USD'
            ? 'US'
            : null;

  const gaps: string[] = [];
  if (compMin === null)
    gaps.push('No compensation range found. Comp is required on every listing.');
  if (!reports) gaps.push('Reporting line not stated.');
  if (priorities.length === 0) gaps.push('No concrete priorities found. Add 3–6.');

  return {
    title: firstLine.slice(0, 120),
    level,
    companyName: null,
    scope: null,
    reportingLine: reports?.[1]?.trim() ?? null,
    teamSize: team ? Number(team[1] ?? team[2]) : null,
    priorities,
    compMin,
    compMax,
    currency,
    compBasis: fractional ? 'monthly_retainer' : 'annual',
    workType: fractional ? 'fractional' : 'full_time',
    location: null,
    remote,
    market,
    gaps,
  };
}
