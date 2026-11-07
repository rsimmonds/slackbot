/** "3h ago", "2d ago". Mono metadata in the queue. */
export function age(date: Date | string, now = Date.now()): string {
  const ms = now - new Date(date).getTime();
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const moveTypeLabel = {
  appointed: 'Appointed',
  departed: 'Departed',
  promoted: 'Promoted',
} as const;
export const articleTypeLabel = {
  story: 'Story',
  interview: 'Interview',
  report: 'Report',
} as const;
export const articleStatusLabel = {
  draft: 'Draft',
  in_review: 'In review',
  rejected: 'Returned',
  published: 'Published',
} as const;
