/** What a key may read. Every endpoint names exactly one scope. */
export const apiScopes = ['moves:read', 'listings:read', 'comp:read'] as const;
export type ApiScope = (typeof apiScopes)[number];

export const scopeLabels: Record<ApiScope, string> = {
  'moves:read': 'CMO moves (and companies)',
  'listings:read': 'Live listings',
  'comp:read': 'Comp aggregates',
};

/** Limits per key. Override in tests or for a specific deployment via env. */
export const rateLimits = () => ({
  perMinute: Number(process.env.API_RATE_PER_MINUTE ?? 60),
  perDay: Number(process.env.API_RATE_PER_DAY ?? 10_000),
});
