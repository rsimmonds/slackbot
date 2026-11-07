import { editInput, type EditInput } from './document';

const field = (fd: FormData, key: string) => String(fd.get(key) ?? '');

/** Rows named like `scorecard.0.outcome` → [{ outcome }]. */
function rows(fd: FormData, prefix: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const re = new RegExp(`^${prefix}\\.(\\d+)\\.(\\w+)$`);
  for (const [k, v] of fd.entries()) {
    const m = k.match(re);
    if (!m) continue;
    (out[Number(m[1])] ??= {})[m[2]!] = String(v);
  }
  return out.filter(Boolean);
}

/** Read the mandate editor form. Lists are one item per line. */
export function readEditForm(fd: FormData): EditInput {
  return editInput.parse({
    title: field(fd, 'title'),
    level: field(fd, 'level'),
    workType: field(fd, 'workType'),
    market: field(fd, 'market'),
    currency: field(fd, 'currency'),
    reportingLine: field(fd, 'reportingLine'),
    teamSize: field(fd, 'teamSize'),
    summary: field(fd, 'summary'),
    priorities: field(fd, 'priorities'),
    tensions: field(fd, 'tensions'),
    nonNegotiables: field(fd, 'nonNegotiables'),
    risks: field(fd, 'risks'),
    scorecard: rows(fd, 'scorecard'),
    interviewPlan: rows(fd, 'interviewPlan'),
    compMin: field(fd, 'compMin').replace(/[,\s]/g, ''),
    compMax: field(fd, 'compMax').replace(/[,\s]/g, ''),
  });
}
