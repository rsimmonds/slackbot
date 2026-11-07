/**
 * Every model name lives here (spec 7). Confirmed against the Claude API model list on 2026-11-07.
 * Prices are USD per million tokens, used to compute agent_runs.cost_micros.
 */
export const models = {
  haiku: 'claude-haiku-5-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
} as const;

export type ModelId = (typeof models)[keyof typeof models];

export const pricing: Record<ModelId, { input: number; output: number; cacheRead: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
};

/** Which model each agent step uses. */
export const agentModels = {
  'moves-tracker.classify': models.haiku,
  'moves-tracker.draft': models.sonnet,
  'listing-parser': models.haiku,
  'mandate-builder': models.opus,
  'profile-interviewer': models.sonnet,
  matcher: models.opus,
  'editorial-assistant': models.sonnet,
} as const;

export type AgentStep = keyof typeof agentModels;

export function costMicros(
  model: ModelId,
  usage: { input: number; output: number; cacheRead?: number },
): number {
  const p = pricing[model];
  // price per token in micro-dollars = price per million tokens
  return Math.round(
    usage.input * p.input + usage.output * p.output + (usage.cacheRead ?? 0) * p.cacheRead,
  );
}
