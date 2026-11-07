import type { ProfileDraft } from '@cmobeat/ai';
import type { Role } from '@cmobeat/config';
import { adminDb, candidateProfiles, encryptJson, interviewSessions, userRoles, users } from '@cmobeat/db';
import { and, eq, ne } from 'drizzle-orm';
import type { Viewer } from '@/lib/auth';

/**
 * A minimal, valid one-page PDF with the given text lines (Helvetica, uncompressed). Enough for
 * real text extraction in tests without binary fixtures in the repo.
 */
export function makePdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content = ['BT', '/F1 11 Tf', '14 TL', '72 740 Td', ...lines.map((l) => `(${esc(l)}) Tj T*`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/** A finished profile interview, stored exactly as the engine stores it. */
export const completeDraft: Partial<ProfileDraft> = {
  level: 'cmo',
  yearsExperience: 15,
  headline: 'CMO who rebuilds demand engines for growth-stage B2B software',
  outcomesByField: {
    outcome_signature: { outcomeType: 'revenue', metric: 'Net new ARR', value: '$12M to $31M', context: 'over two years', evidenceNote: 'Board deck' },
    outcome_pipeline: { outcomeType: 'pipeline', metric: 'Sourced pipeline share', value: '22% to 51%', context: 'in 18 months', evidenceNote: null },
    outcome_brand: { outcomeType: 'brand', metric: 'Win rate against main competitor', value: '28% to 41%', context: null, evidenceNote: null },
  },
  teamBuilds: ['Built a 35-person team across demand, brand and PMM in 12 months'],
  aiFluency: 'We use Claude to turn win-loss interviews into weekly messaging updates for sales.',
  ideal: {
    summary: 'A Series C company with product-market fit and a demand engine the board does not trust yet.',
    stages: ['Series C+', 'Pre-IPO'],
    industries: ['B2B SaaS', 'Security'],
    workTypes: ['full_time'],
    markets: ['US', 'CA'],
    reportingLine: 'CEO',
    dealBreakers: ['No budget authority'],
  },
  scrubbed: ['age'],
};

export async function createProfileSession(ownerId: string, draft: Partial<ProfileDraft> = completeDraft) {
  const id = crypto.randomUUID();
  const state = { turns: [], draft, remaining: [], questionIndex: 13, done: true };
  await adminDb()
    .insert(interviewSessions)
    .values({ id, ownerId, kind: 'profile', status: 'complete', questionIndex: 13, transcript: await encryptJson(state, { aad: id }) });
  return id;
}

/** A seeded candidate other than the dev candidate, to test candidate-to-candidate isolation. */
export async function otherCandidate(excludeUserId: string): Promise<Viewer> {
  const [row] = await adminDb()
    .select({ id: users.id, email: users.email, name: users.displayName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(candidateProfiles, eq(candidateProfiles.userId, users.id))
    .where(and(eq(userRoles.role, 'candidate'), ne(users.id, excludeUserId)))
    .limit(1);
  return { id: row!.id, email: row!.email, name: row!.name, roles: ['reader', 'candidate'] as Role[] };
}

export async function profileIdOf(userId: string): Promise<string> {
  const [p] = await adminDb().select({ id: candidateProfiles.id }).from(candidateProfiles).where(eq(candidateProfiles.userId, userId));
  return p!.id;
}
