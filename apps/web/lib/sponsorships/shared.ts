import { z } from 'zod';

/** Where a sponsorship can appear. One live booking per placement is shown at a time. */
export const placements = ['home', 'article_foot', 'jobs_index', 'newsletter'] as const;
export type Placement = (typeof placements)[number];

export const placementLabel: Record<Placement, string> = {
  home: 'Home page',
  article_foot: 'Article foot',
  jobs_index: 'Jobs index',
  newsletter: 'Newsletter',
};

/**
 * The creative is plain text plus one link. No scripts, no pixels and no remote images: a logo
 * must be a file we host (a path starting with "/"), so a sponsor can never track our readers.
 * We never append tracking parameters to the sponsor's link.
 */
export const creativeSchema = z.object({
  headline: z.string().trim().min(3).max(90),
  body: z.string().trim().max(280).default(''),
  url: z.url({ protocol: /^https$/, error: 'Use a full https:// link.' }).max(500),
  logoUrl: z
    .string()
    .trim()
    .max(200)
    .regex(/^\/[A-Za-z0-9/_\-.]+$/, 'Logos must be hosted by us: a path starting with "/".')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type Creative = z.infer<typeof creativeSchema>;

export type SponsorshipStatus = 'scheduled' | 'active' | 'ended';

export function statusOf(
  row: { startDate: string; endDate: string },
  on = new Date().toISOString().slice(0, 10),
): SponsorshipStatus {
  if (row.endDate < on) return 'ended';
  if (row.startDate > on) return 'scheduled';
  return 'active';
}

export const formatAmount = (minor: number, currency: string) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
