import { currencies, markets } from '@cmobeat/config';
import { z } from 'zod';

/** Listing Parser output: a structured mandate the employer reviews and confirms. */
export const ParsedListingSchema = z.object({
  title: z.string().min(2).describe('Role title as written, e.g. "Chief Marketing Officer"'),
  level: z.enum(['vp_marketing', 'cmo', 'chief_growth_officer', 'fractional_cmo']),
  companyName: z.string().nullable(),
  scope: z.string().nullable().describe('One or two sentences on what the role owns'),
  reportingLine: z.string().nullable().describe('Who the role reports to, e.g. "CEO"'),
  teamSize: z.number().int().nonnegative().nullable(),
  priorities: z.array(z.string()).max(8).describe('The real mandate: 3–6 concrete priorities'),
  compMin: z.number().int().positive().nullable(),
  compMax: z.number().int().positive().nullable(),
  currency: z.enum(currencies).nullable(),
  compBasis: z.enum(['annual', 'monthly_retainer']),
  workType: z.enum(['full_time', 'fractional']),
  location: z.string().nullable(),
  remote: z.boolean(),
  market: z.enum(markets).nullable(),
  /** Things the employer must fix before publishing, e.g. "No compensation range found." */
  gaps: z.array(z.string()),
});
export type ParsedListing = z.infer<typeof ParsedListingSchema>;
