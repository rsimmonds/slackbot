import type { Db } from '@cmobeat/db';
import { tagged } from '../format';
import { htmlToText, safeFetch, UnsafeUrlError } from '../net/safe-fetch';
import type { LlmProvider } from '../provider';
import { runAgent } from '../run-agent';
import { ParsedListingSchema, type ParsedListing } from '../schemas/listing';
import type { AgentResult } from '../types';

export interface ParseListingInput {
  /** Pasted job description. */
  text?: string;
  /** URL the employer pasted; fetched server-side. */
  url?: string;
  /** For agent_runs logging. */
  actorId?: string;
  /** Tests only. */
  provider?: LlmProvider;
  db?: Db;
  fetchText?: (url: string) => Promise<string>;
}

/** Long enough for any real job description; keeps cost bounded. */
export const MAX_JD_CHARS = 40_000;
/** The exact user turn the model sees. Shared with the evals so they test what production sends. */
export const listingUserMessage = (text: string, url?: string) =>
  `${url ? `Source URL: ${url}\n\n` : ''}${tagged('job_description', text.slice(0, MAX_JD_CHARS))}`;

const COMP_GAP = 'No compensation range found. Comp is required on every listing.';

async function fetchListingText(url: string): Promise<string> {
  const res = await safeFetch(url);
  return /html/i.test(res.contentType) ? htmlToText(res.body) : res.body;
}

/**
 * Rules the employer can rely on whatever the model returns: comp is required, ranges are
 * ordered, and the gaps list says so plainly.
 */
export function enforceListingRules(p: ParsedListing): ParsedListing {
  let { compMin, compMax } = p;
  if (compMin !== null && compMax !== null && compMin > compMax)
    [compMin, compMax] = [compMax, compMin];
  if (compMin === null && compMax !== null) compMin = compMax;
  if (compMax === null && compMin !== null) compMax = compMin;
  const gaps = [...p.gaps];
  const hasCompGap = gaps.some((g) => /comp/i.test(g));
  if ((compMin === null || p.currency === null) && !hasCompGap) gaps.unshift(COMP_GAP);
  const workType = p.level === 'fractional_cmo' ? 'fractional' : p.workType;
  const compBasis = workType === 'fractional' ? p.compBasis : 'annual';
  return { ...p, compMin, compMax, workType, compBasis, gaps };
}

/**
 * Listing Parser (spec 7): job description (text or a single URL) to a structured mandate the
 * employer edits and confirms. Haiku, structured output, retry once, then the human queue.
 */
export async function parseListing(input: ParseListingInput): Promise<AgentResult<ParsedListing>> {
  let text = input.text?.trim() ?? '';
  if (!text && input.url) {
    try {
      text = (await (input.fetchText ?? fetchListingText)(input.url)).trim();
    } catch (error) {
      const reason =
        error instanceof UnsafeUrlError
          ? error.message
          : 'We could not read that page. Paste the job description instead.';
      return { ok: false, reason, runId: 'not-run', queued: false };
    }
  }
  if (!text)
    return {
      ok: false,
      reason: 'Paste the job description text.',
      runId: 'not-run',
      queued: false,
    };

  const result = await runAgent({
    step: 'listing-parser',
    user: listingUserMessage(text, input.url && !input.text ? input.url : undefined),
    schema: ParsedListingSchema,
    actorId: input.actorId ?? null,
    provider: input.provider,
    db: input.db,
    maxTokens: 4000,
  });
  return result.ok ? { ...result, output: enforceListingRules(result.output) } : result;
}
