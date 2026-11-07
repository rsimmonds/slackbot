/** Launch markets. Every comp figure carries a currency; nothing assumes USD. */
export const markets = ['US', 'CA', 'EU', 'UK'] as const;
export type Market = (typeof markets)[number];

export const currencies = ['USD', 'CAD', 'EUR', 'GBP'] as const;
export type Currency = (typeof currencies)[number];

export const defaultCurrency: Record<Market, Currency> = {
  US: 'USD',
  CA: 'CAD',
  EU: 'EUR',
  UK: 'GBP',
};

/** Annual for full-time roles, monthly retainer for fractional. */
export const compBases = ['annual', 'monthly_retainer'] as const;
export type CompBasis = (typeof compBases)[number];

export function formatComp(
  min: number,
  max: number,
  currency: Currency,
  basis: CompBasis = 'annual',
  locale = 'en-US',
): string {
  const fmt = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 0,
  });
  const suffix = basis === 'monthly_retainer' ? ' / mo' : '';
  return `${fmt.format(min)}–${fmt.format(max)}${suffix}`;
}
