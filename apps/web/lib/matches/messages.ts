import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  adminDb,
  audit,
  candidateProfiles,
  decryptField,
  encryptField,
  matches,
  messages,
  revealRequests,
  users,
} from '@cmobeat/db';
import { newMessageEmail, sendEmail } from '@cmobeat/email';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { myMatches } from './candidate';
import { MatchError, notify } from './shared';

export const messageAad = (messageId: string) => `messages.body:${messageId}`;

export interface Thread {
  matchId: string;
  side: 'candidate' | 'employer';
  /** Who is on the other side, as far as this viewer is allowed to know. */
  counterpart: string;
  roleTitle: string;
  mandateId: string | null;
  messages: { id: string; mine: boolean; body: string; at: Date }[];
}

/**
 * Which side of a revealed match the viewer is on. Candidates need a live reveal consent;
 * employers need the view to show identity (which also requires that consent).
 */
async function sideOf(viewer: Viewer, matchId: string) {
  if (viewer.roles.includes('candidate')) {
    const m = (await myMatches(viewer)).find((x) => x.matchId === matchId);
    if (m?.revealedNow)
      return {
        side: 'candidate' as const,
        counterpart: m.company.name ?? 'The hiring team',
        roleTitle: m.role.title,
        mandateId: null,
      };
  }
  if (viewer.roles.includes('employer')) {
    const [row] = await asViewer(viewer, async (tx) => [
      ...(await tx.execute<{
        candidate_name: string | null;
        mandate_title: string;
        mandate_id: string;
        identity_revealed: boolean;
      }>(
        sql`select candidate_name, mandate_title, mandate_id, identity_revealed
            from employer_match_view where match_id = ${matchId}`,
      )),
    ]);
    if (row?.identity_revealed)
      return {
        side: 'employer' as const,
        counterpart: row.candidate_name ?? 'The candidate',
        roleTitle: row.mandate_title,
        mandateId: row.mandate_id,
      };
  }
  throw new MatchError('Messages open once both sides have agreed to an introduction.', 404);
}

export async function getThread(viewer: Viewer | null, matchId: string): Promise<Thread> {
  if (!viewer) throw new MatchError('Sign in to continue.', 401);
  const s = await sideOf(viewer, matchId);
  const rows = await asViewer(viewer, (tx) =>
    tx
      .select()
      .from(messages)
      .where(eq(messages.matchId, matchId))
      .orderBy(asc(messages.createdAt)),
  );
  return {
    matchId,
    ...s,
    messages: await Promise.all(
      rows.map(async (m) => ({
        id: m.id,
        mine: m.senderId === viewer.id,
        body: await decryptField(m.body, { aad: messageAad(m.id) }).catch(
          () => '[This message could not be decrypted]',
        ),
        at: m.createdAt,
      })),
    ),
  };
}

export const messageInput = z.object({ body: z.string().trim().min(1).max(4000) });

export async function sendMessage(viewer: Viewer | null, matchId: string, raw: unknown) {
  if (!viewer) throw new MatchError('Sign in to continue.', 401);
  const { body } = messageInput.parse(raw);
  const s = await sideOf(viewer, matchId);
  const id = randomUUID();
  await asViewer(viewer, async (tx) => {
    await tx.insert(messages).values({
      id,
      matchId,
      senderId: viewer.id,
      body: await encryptField(body, { aad: messageAad(id) }),
    });
    // The audit trail records that a message was sent, never what it said.
    await audit(tx, {
      actorId: viewer.id,
      action: 'message.send',
      targetType: 'match',
      targetId: matchId,
      metadata: { messageId: id, side: s.side },
    });
  });
  await notify(async () => {
    const db = adminDb();
    const [m] = await db
      .select({ mandateId: matches.mandateId, profileId: matches.profileId })
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1);
    if (!m) return;
    if (s.side === 'employer') {
      const [u] = await db
        .select({ email: users.email })
        .from(candidateProfiles)
        .innerJoin(users, eq(users.id, candidateProfiles.userId))
        .where(and(eq(candidateProfiles.id, m.profileId), isNull(users.deletedAt)))
        .limit(1);
      if (u) await sendEmail(await newMessageEmail(u.email, `/me/matches/${matchId}/messages`));
    } else {
      const [u] = await db
        .select({ email: users.email })
        .from(revealRequests)
        .innerJoin(users, eq(users.id, revealRequests.requestedBy))
        .where(
          and(
            eq(revealRequests.matchId, matchId),
            eq(revealRequests.candidateDecision, 'accepted'),
            isNull(users.deletedAt),
          ),
        )
        .limit(1);
      if (u)
        await sendEmail(
          await newMessageEmail(
            u.email,
            `/employer/mandates/${m.mandateId}/shortlist/${matchId}/messages`,
          ),
        );
    }
  });
  return { id, matchId };
}
