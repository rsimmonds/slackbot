import { markets } from '@cmobeat/config';
import { z } from 'zod';

/**
 * Profile Interviewer output: a proof-of-outcomes portfolio. The candidate approves every line
 * before it is saved. No protected attributes are ever asked for or stored here.
 */
export const OutcomeSchema = z.object({
  outcomeType: z.enum([
    'revenue',
    'pipeline',
    'brand',
    'efficiency',
    'team',
    'product',
    'market_entry',
    'other',
  ]),
  metric: z.string().min(2).describe('What moved, e.g. "Sourced pipeline share"'),
  value: z.string().min(1).describe('By how much, as stated, e.g. "18% to 46%"'),
  context: z
    .string()
    .nullable()
    .describe('Stage, company type, timeframe — without naming the employer'),
  evidenceNote: z
    .string()
    .nullable()
    .describe('How this could be verified, e.g. "Board deck, Q3 2024"'),
});
export type Outcome = z.infer<typeof OutcomeSchema>;

export const ProfilePortfolioSchema = z.object({
  headline: z.string().min(10).max(140).describe('One line, no employer names'),
  level: z.enum(['vp_marketing', 'cmo', 'chief_growth_officer', 'fractional_cmo']),
  yearsExperience: z.number().int().min(0).max(60).nullable(),
  outcomes: z.array(OutcomeSchema).min(3).max(10),
  teamBuilds: z
    .array(z.string())
    .max(5)
    .describe('Teams built or rebuilt, with size and timeframe'),
  aiFluency: z.string().nullable().describe('How they use AI in marketing, concretely'),
  idealMandate: z.object({
    summary: z.string().min(10),
    stages: z.array(z.string()).max(4),
    industries: z.array(z.string()).max(6),
    workTypes: z.array(z.enum(['full_time', 'fractional'])).min(1),
    markets: z.array(z.enum(markets)).min(1),
    reportingLine: z.string().nullable(),
    dealBreakers: z.array(z.string()).max(5),
  }),
});
export type ProfilePortfolio = z.infer<typeof ProfilePortfolioSchema>;
