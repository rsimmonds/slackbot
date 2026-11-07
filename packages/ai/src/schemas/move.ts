import { z } from 'zod';

/** Stage 1 (Haiku): is this public item a CMO-level appointment, departure or promotion? */
export const MoveClassificationSchema = z.object({
  relevant: z.boolean(),
  moveType: z.enum(['appointed', 'departed', 'promoted']).nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});
export type MoveClassification = z.infer<typeof MoveClassificationSchema>;

/** Stage 2 (Sonnet): a draft move for the editorial queue. Sources or silence. */
export const MoveDraftSchema = z.object({
  personName: z.string().min(2),
  companyName: z.string().min(1),
  moveType: z.enum(['appointed', 'departed', 'promoted']),
  title: z.string().min(2),
  previousRole: z.string().nullable(),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  summary: z.string().max(600),
  sources: z
    .array(
      z.object({
        url: z.string().url(),
        label: z.string(),
        kind: z.enum(['newsroom', 'wire', 'edgar', 'submission']),
      }),
    )
    .min(1),
  confidence: z.number().min(0).max(1),
});
export type MoveDraft = z.infer<typeof MoveDraftSchema>;
