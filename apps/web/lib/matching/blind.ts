/**
 * Blind profile builder (spec 7.1.4). The implementation lives in @cmobeat/ai so the pipeline,
 * the evals and the fairness suite all use exactly the same code; this module is the web app's
 * entry point to it.
 */
export {
  buildBlindProfile,
  blindProfileText,
  makeCleaner,
  type RawProfileForBlind,
} from '@cmobeat/ai/matching';
