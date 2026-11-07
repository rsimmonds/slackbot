import type { ParsedListing } from '../schemas/listing';
import type { AgentResult } from '../types';

export interface ParseListingInput {
  /** Pasted job description. */
  text?: string;
  /** URL the employer pasted; fetched server-side. */
  url?: string;
  /** For agent_runs logging. */
  actorId?: string;
}

/** CONTRACT STUB — replaced by the Listing Parser implementation (Phase 1, agents workstream). */
export async function parseListing(_input: ParseListingInput): Promise<AgentResult<ParsedListing>> {
  throw new Error('parseListing not implemented yet');
}
