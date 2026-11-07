import { ParsedListingSchema, type ParsedListing } from '../schemas/listing';
import type { AgentResult } from '../types';
import { heuristicParseListing } from './listing-heuristic';

export interface ParseListingInput {
  /** Pasted job description. */
  text?: string;
  /** URL the employer pasted; fetched server-side. */
  url?: string;
  /** For agent_runs logging. */
  actorId?: string;
}

/**
 * CONTRACT. Offline heuristic path only, for now. The agents workstream adds the Claude-backed
 * path, URL fetching, agent_runs logging and the human-queue fallback behind this same signature.
 */
export async function parseListing(input: ParseListingInput): Promise<AgentResult<ParsedListing>> {
  if (!input.text?.trim()) {
    return { ok: false, reason: 'Paste the job description text.', runId: 'offline', queued: true };
  }
  const output = ParsedListingSchema.parse(heuristicParseListing(input.text));
  return { ok: true, output, runId: 'offline' };
}
