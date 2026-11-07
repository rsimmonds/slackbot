import { markets } from '@cmobeat/config';
import { z } from 'zod';
import { OutcomeSchema } from './profile';

/**
 * What the Matcher is allowed to see about a candidate (spec 7.1.4, blind matching).
 * Built by the blind-profile builder from approved profile data only. It never carries a name,
 * photo, contact detail, employer name, years of experience or graduation year, or any
 * protected attribute. `ref` is an opaque per-run token, not the profile id.
 */
export const BlindProfileSchema = z.object({
  ref: z.string().regex(/^P[0-9A-Z]{6}$/),
  level: z.enum(['vp_marketing', 'cmo', 'chief_growth_officer', 'fractional_cmo']),
  outcomes: z.array(OutcomeSchema.omit({ evidenceNote: true })).max(10),
  teamBuilds: z.array(z.string()).max(5),
  aiFluency: z.string().nullable(),
  ideal: z.object({
    summary: z.string(),
    stages: z.array(z.string()),
    industries: z.array(z.string()),
    workTypes: z.array(z.enum(['full_time', 'fractional'])),
    markets: z.array(z.enum(markets)),
    reportingLine: z.string().nullable(),
  }),
});
export type BlindProfile = z.infer<typeof BlindProfileSchema>;

/** The mandate as the Matcher sees it: the role, never the company name. */
export const BlindMandateSchema = z.object({
  title: z.string(),
  level: z.enum(['vp_marketing', 'cmo', 'chief_growth_officer', 'fractional_cmo']),
  workType: z.enum(['full_time', 'fractional']),
  market: z.enum(markets),
  companyStage: z.string(),
  companyIndustry: z.string(),
  summary: z.string().nullable(),
  priorities: z.array(z.string()),
  reportingLine: z.string().nullable(),
  teamSize: z.number().int().nullable(),
});
export type BlindMandate = z.infer<typeof BlindMandateSchema>;

/** Matcher output: ranked candidates with a fit RANGE and plain-language reasons. */
export const MatchRankingSchema = z.object({
  matches: z
    .array(
      z.object({
        ref: z.string(),
        scoreLow: z.number().int().min(0).max(100),
        scoreHigh: z.number().int().min(0).max(100),
        summary: z.string().min(10).max(400),
        reasons: z
          .array(z.object({ reason: z.string().min(5), direction: z.enum(['for', 'against']) }))
          .min(2)
          .max(6),
      }),
    )
    .max(25),
});
export type MatchRanking = z.infer<typeof MatchRankingSchema>;
