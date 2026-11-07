/**
 * Public contract of @cmobeat/ai. Implementations live in ./agents/*.
 *
 * AI_PROVIDER=anthropic uses the Claude API; AI_PROVIDER=fake (default without ANTHROPIC_API_KEY)
 * uses deterministic fixtures so dev, CI and e2e run without a key.
 */
export * from './models';
export * from './schemas';
export type { AgentResult } from './types';
export { parseListing, type ParseListingInput } from './agents/listing-parser';
