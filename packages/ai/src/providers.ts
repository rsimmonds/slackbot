import { heuristicParseListing } from './agents/listing-heuristic';
import { heuristicClassify, heuristicDraft } from './agents/moves-heuristic';
import { readTagged, readSourceItem } from './format';
import { matcherFallback } from './matching/rank';
import { AnthropicProvider, FakeProvider, type Fallback, type LlmProvider } from './provider';

/** Deterministic stand-ins used when no model is configured. */
export const offlineFallbacks: Record<string, Fallback> = {
  'listing-parser': (req) => heuristicParseListing(readTagged(req.user, 'job_description')),
  'moves-tracker.classify': (req) => heuristicClassify(readSourceItem(req.user)),
  'moves-tracker.draft': (req) => heuristicDraft(readSourceItem(req.user)),
  matcher: matcherFallback,
};

export type ProviderName = 'anthropic' | 'fake';

/** AI_PROVIDER wins; otherwise the Claude API when a key is present, else offline. */
export function providerName(env: NodeJS.ProcessEnv = process.env): ProviderName {
  if (env.AI_PROVIDER === 'anthropic' || env.AI_PROVIDER === 'fake') return env.AI_PROVIDER;
  return env.ANTHROPIC_API_KEY ? 'anthropic' : 'fake';
}

let cached: LlmProvider | undefined;
export function defaultProvider(): LlmProvider {
  cached ??=
    providerName() === 'anthropic'
      ? new AnthropicProvider()
      : new FakeProvider(new Map(), offlineFallbacks);
  return cached;
}
