import { randomUUID } from 'node:crypto';
import { adminDb, sourceItems, type Tx } from '@cmobeat/db';
import { and, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { assertSafeUrl, UnsafeUrlError } from '../net/safe-fetch';
import { contentHash } from './sweep';
import { isForbiddenSource } from './sources';

export const TIPS_PER_DAY = 5;

export const TipSchema = z.object({
  person: z.string().trim().min(2, 'Add the person’s name.').max(120),
  company: z.string().trim().min(1, 'Add the company.').max(160),
  role: z.string().trim().min(2, 'Add the role.').max(120),
  move: z.enum(['appointed', 'departed', 'promoted']),
  url: z.string().trim().url('Add a link to a public source.').max(2000),
  note: z.string().trim().max(1000).optional().default(''),
});
export type Tip = z.infer<typeof TipSchema>;

export type TipResult = { ok: true; id: string } | { ok: false; error: string };

/** Count today's tips by this user. Runs on the owner connection: tip rows are not readable by their author. */
export async function tipsToday(userId: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 24 * 3600_000);
  const [row] = await adminDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(sourceItems)
    .where(and(eq(sourceItems.submittedBy, userId), gte(sourceItems.createdAt, since)));
  return row?.n ?? 0;
}

/**
 * A signed-in reader submits a tip with a public source. Inserted through the reader's own
 * connection (RLS: kind=submission, submitted_by=self, status=new). The next sweep classifies it;
 * an editor always verifies the source before anything is published.
 */
export async function submitTip(
  tx: Tx,
  userId: string,
  input: unknown,
  now = new Date(),
): Promise<TipResult> {
  const parsed = TipSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' };
  const tip = parsed.data;
  try {
    assertSafeUrl(tip.url);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof UnsafeUrlError ? e.message : 'That link is not valid.',
    };
  }
  if (isForbiddenSource(tip.url))
    return {
      ok: false,
      error:
        'We can’t use LinkedIn as a source. Link to a company newsroom, press release or filing.',
    };
  if ((await tipsToday(userId, now)) >= TIPS_PER_DAY)
    return {
      ok: false,
      error: `You can send ${TIPS_PER_DAY} tips a day. Thank you. Try again tomorrow.`,
    };

  const text = [
    `Reader tip.`,
    `Person: ${tip.person}`,
    `Company: ${tip.company}`,
    `Role: ${tip.role}`,
    `Move: ${tip.move}`,
    tip.note ? `Note: ${tip.note}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const title = `${tip.company}: ${tip.person}, ${tip.role} (${tip.move})`;
  // No RETURNING and no ON CONFLICT: both need read access, and authors cannot read tip rows (RLS).
  // The id is generated here, and the insert runs in a savepoint so a duplicate URL rolls back
  // only this statement, not the caller's transaction.
  const id = randomUUID();
  try {
    await tx.transaction(async (sp) => {
      await sp.insert(sourceItems).values({
        id,
        kind: 'submission',
        url: tip.url,
        title,
        publisher: 'Reader tip',
        contentHash: contentHash(title, text),
        excerpt: text,
        submittedBy: userId,
        status: 'new',
      });
    });
  } catch (e) {
    const code = (e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
    if (code === '23505') return { ok: false, error: 'We already have that source. Thank you.' };
    throw e;
  }
  return { ok: true, id };
}
