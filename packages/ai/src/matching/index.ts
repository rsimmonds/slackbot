/** Blind matching (spec 7.1.4–7.1.9): filters, blind builder, ranking, batches, evals, fairness. */
export * from './filters';
export {
  buildBlindProfile,
  blindProfileText,
  makeCleaner,
  randomRef,
  type RawOutcome,
  type RawIdeal,
  type RawProfileForBlind,
} from './blind';
export {
  blindMandateText,
  matcherUserMessage,
  readMatcherInput,
  rankOffline,
  sanitizeRanking,
  matcherFallback,
} from './rank';
export {
  submitMatcherBatch,
  collectMatcherBatch,
  collectMatcherBatchIfEnded,
  matcherBatchParams,
  type BatchesClient,
  type BatchOutcome,
  type BatchRequest,
  type BatchResultLine,
} from './batch';
export {
  runFairnessSuite,
  protectedAttributes,
  syntheticBase,
  syntheticMandates,
  variant,
  unblinded,
  type FairnessMetrics,
  type GroupRate,
  type Matcher,
} from './fairness';
export {
  runMatcherSuite,
  loadMatcherSuite,
  providerMatcher,
  type MatcherSuiteResult,
} from './evals';
