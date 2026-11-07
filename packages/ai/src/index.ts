/**
 * Public contract of @cmobeat/ai.
 *
 * AI_PROVIDER=anthropic uses the Claude API; AI_PROVIDER=fake (default without ANTHROPIC_API_KEY)
 * uses recorded outputs and deterministic fallbacks so dev, CI and e2e run without a key.
 */
export * from './models';
export * from './schemas';
export type { AgentResult } from './types';
export { parseListing, enforceListingRules, type ParseListingInput } from './agents/listing-parser';
export { runAgent, type RunAgentOptions } from './run-agent';
export {
  AnthropicProvider,
  FakeProvider,
  requestKey,
  type LlmProvider,
  type CompletionRequest,
  type CompletionResponse,
} from './provider';
export { defaultProvider, providerName, offlineFallbacks } from './providers';
export { systemPrompt } from './prompts';
export {
  safeFetch,
  assertSafeUrl,
  htmlToText,
  isBlockedAddress,
  UnsafeUrlError,
} from './net/safe-fetch';
export {
  runMovesSweep,
  ingest,
  enforceSources,
  resolveCompany,
  contentHash,
  type SweepReport,
} from './moves/sweep';
export {
  adaptersFromEnv,
  feedAdapter,
  edgarAdapter,
  parseFeed,
  isForbiddenSource,
  type SourceAdapter,
  type RawSourceItem,
} from './moves/sources';
export { fixtureAdapters } from './moves/fixtures';
export {
  submitTip,
  tipsToday,
  TipSchema,
  TIPS_PER_DAY,
  type Tip,
  type TipResult,
} from './moves/tips';
