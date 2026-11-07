import { currencies, markets } from '@cmobeat/config';
import { z } from 'zod';

/** Mandate Builder output: the real definition of the role, written with the CEO or a board member. */
export const MandateDocumentSchema = z.object({
  title: z.string().min(2),
  level: z.enum(['vp_marketing', 'cmo', 'chief_growth_officer', 'fractional_cmo']),
  workType: z.enum(['full_time', 'fractional']),
  market: z.enum(markets),
  currency: z.enum(currencies),
  reportingLine: z.string().min(2),
  teamSize: z.number().int().nonnegative().nullable(),
  /** Why the company is hiring now, in two or three sentences. */
  summary: z.string().min(20),
  /** The 3–6 things that must be true in 12 months. */
  priorities: z.array(z.string().min(5)).min(3).max(6),
  /** What the person will disagree with, and who wins. */
  tensions: z.array(z.string()).max(5),
  nonNegotiables: z.array(z.string()).max(6),
  risks: z.array(z.string()).max(6),
  /** 90-day scorecard: outcomes with how each will be measured. */
  scorecard: z
    .array(
      z.object({
        outcome: z.string().min(5),
        measure: z.string().min(3),
        byDay: z.union([z.literal(30), z.literal(60), z.literal(90)]),
      }),
    )
    .min(3)
    .max(8),
  /** Interview plan: stages, who runs them, what each tests. */
  interviewPlan: z
    .array(
      z.object({ stage: z.string(), interviewer: z.string(), tests: z.array(z.string()).min(1) }),
    )
    .min(3)
    .max(7),
  /** Comp the employer intends to offer. The benchmark beside it is computed from data, not by the model. */
  compMin: z.number().int().positive().nullable(),
  compMax: z.number().int().positive().nullable(),
  compBasis: z.enum(['annual', 'monthly_retainer']),
});
export type MandateDocument = z.infer<typeof MandateDocumentSchema>;
