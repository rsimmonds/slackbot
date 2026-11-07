import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import {
  adminDb,
  audit,
  companies,
  employerInvites,
  employerMembers,
  userRoles,
  users,
} from '@cmobeat/db';
import { seatInviteEmail, sendEmail } from '@cmobeat/email';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { BillingError, employerBilling, seatLimit, type EmployerBilling } from './subscriptions';

export const INVITE_DAYS = 14;
export const hashInviteToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface TeamMember {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  seatRole: 'owner' | 'admin' | 'member';
  joinedAt: Date;
}

export interface PendingInvite {
  id: string;
  email: string;
  seatRole: 'owner' | 'admin' | 'member';
  expiresAt: Date;
}

export interface Team {
  billing: EmployerBilling;
  members: TeamMember[];
  invites: PendingInvite[];
  used: number;
  limit: number;
  canManage: boolean;
}

/** Members (via company_team_view), and pending invites for admins. Seats used counts both. */
export async function teamFor(viewer: Viewer): Promise<Team> {
  const billing = await employerBilling(viewer);
  const canManage = billing.seatRole !== 'member';
  return asViewer(viewer, async (tx) => {
    const members = (
      await tx.execute<{
        member_id: string;
        user_id: string;
        display_name: string;
        email: string;
        seat_role: TeamMember['seatRole'];
        joined_at: string;
      }>(
        sql`select member_id, user_id, display_name, email, seat_role, joined_at
            from company_team_view where company_id = ${billing.companyId}
            order by case seat_role when 'owner' then 0 when 'admin' then 1 else 2 end, joined_at`,
      )
    ).map((r) => ({
      memberId: r.member_id,
      userId: r.user_id,
      name: r.display_name,
      email: r.email,
      seatRole: r.seat_role,
      joinedAt: new Date(r.joined_at),
    }));
    // RLS shows invites to company admins only; members see an empty list.
    const invites = await tx
      .select({
        id: employerInvites.id,
        email: employerInvites.email,
        seatRole: employerInvites.seatRole,
        expiresAt: employerInvites.expiresAt,
      })
      .from(employerInvites)
      .where(
        and(
          eq(employerInvites.companyId, billing.companyId),
          isNull(employerInvites.acceptedAt),
          isNull(employerInvites.revokedAt),
          gt(employerInvites.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(employerInvites.createdAt));
    return {
      billing,
      members,
      invites,
      used: members.length + invites.length,
      limit: seatLimit(billing.subscription),
      canManage,
    };
  });
}

export const inviteInput = z.object({
  email: z
    .email()
    .max(254)
    .transform((e) => e.trim().toLowerCase()),
  seatRole: z.enum(['admin', 'member']).default('member'),
});

/** Invite a teammate. Owners and admins only; never beyond the seat limit. */
export async function inviteTeammate(
  viewer: Viewer,
  input: z.infer<typeof inviteInput>,
  origin: string,
): Promise<{ inviteId: string }> {
  const team = await teamFor(viewer);
  if (!team.canManage) throw new BillingError('Only owners and admins invite teammates.', 403);
  if (team.used >= team.limit)
    throw new BillingError(
      team.billing.subscription?.active
        ? `All ${team.limit} seats are in use. Add seats from billing, or remove someone first.`
        : `All ${team.limit} free seats are in use. Subscribe for more seats.`,
      409,
    );
  if (team.members.some((m) => m.email.toLowerCase() === input.email))
    throw new BillingError('That person is already on your team.', 409);
  if (team.invites.some((i) => i.email.toLowerCase() === input.email))
    throw new BillingError('That person already has a pending invitation.', 409);

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 864e5);
  const id = await asViewer(viewer, async (tx) => {
    const [row] = await tx
      .insert(employerInvites)
      .values({
        companyId: team.billing.companyId,
        email: input.email,
        seatRole: input.seatRole,
        tokenHash: hashInviteToken(token),
        invitedBy: viewer.id,
        expiresAt,
      })
      .returning({ id: employerInvites.id });
    await audit(tx, {
      actorId: viewer.id,
      action: 'team.invited',
      targetType: 'company',
      targetId: team.billing.companyId,
      metadata: { inviteId: row!.id, seatRole: input.seatRole },
    });
    return row!.id;
  });
  const mail = await seatInviteEmail({
    to: input.email,
    companyName: team.billing.companyName,
    inviterName: viewer.name,
    acceptUrl: `${origin}/invite/${token}`,
    expiresOn: expiresAt.toISOString().slice(0, 10),
  });
  // The token appears only in the email itself, never in the stored payload.
  await sendEmail({ ...mail, payload: { inviteId: id } });
  return { inviteId: id };
}

export async function revokeInvite(viewer: Viewer, inviteId: string): Promise<void> {
  const team = await teamFor(viewer);
  if (!team.canManage) throw new BillingError('Only owners and admins manage invitations.', 403);
  await asViewer(viewer, async (tx) => {
    const rows = await tx
      .update(employerInvites)
      .set({ revokedAt: new Date() })
      .where(and(eq(employerInvites.id, inviteId), isNull(employerInvites.acceptedAt)))
      .returning({ id: employerInvites.id });
    if (!rows.length) throw new BillingError('Invitation not found.', 404);
    await audit(tx, {
      actorId: viewer.id,
      action: 'team.invite_revoked',
      targetType: 'company',
      targetId: team.billing.companyId,
      metadata: { inviteId },
    });
  });
}

/** Remove a teammate. Admins only; you can't remove yourself; the database keeps the last owner. */
export async function removeMember(viewer: Viewer, memberId: string): Promise<void> {
  const team = await teamFor(viewer);
  if (!team.canManage) throw new BillingError('Only owners and admins remove teammates.', 403);
  const member = team.members.find((m) => m.memberId === memberId);
  if (!member) throw new BillingError('Teammate not found.', 404);
  if (member.userId === viewer.id) throw new BillingError('You can’t remove yourself.', 409);
  if (member.seatRole === 'owner' && team.billing.seatRole !== 'owner')
    throw new BillingError('Only an owner can remove another owner.', 403);
  try {
    await asViewer(viewer, async (tx) => {
      await tx.delete(employerMembers).where(eq(employerMembers.id, memberId));
      await audit(tx, {
        actorId: viewer.id,
        action: 'team.member_removed',
        targetType: 'company',
        targetId: team.billing.companyId,
        metadata: { userId: member.userId, seatRole: member.seatRole },
      });
    });
    // No seats left anywhere: the person is no longer an employer (system write; user_roles has no
    // app-level delete grant).
    const remaining = await adminDb()
      .select({ id: employerMembers.id })
      .from(employerMembers)
      .where(eq(employerMembers.userId, member.userId))
      .limit(1);
    if (!remaining.length)
      await adminDb()
        .delete(userRoles)
        .where(and(eq(userRoles.userId, member.userId), eq(userRoles.role, 'employer')));
  } catch (e) {
    if (
      (e as { cause?: { code?: string } }).cause?.code === '23514' ||
      (e as { code?: string }).code === '23514'
    )
      throw new BillingError('A company must keep at least one owner.', 409);
    throw e;
  }
}

export type AcceptResult =
  | { ok: true; companyId: string }
  | { ok: false; reason: 'unknown' | 'expired' | 'used' | 'revoked' | 'wrong_email' };

/**
 * Accept an invitation. The database function checks the signed-in email matches and adds the
 * seat atomically. When it refuses, a system read of the invite (by its hash, which only the
 * token holder can compute) explains why.
 */
export async function acceptInvite(viewer: Viewer, token: string): Promise<AcceptResult> {
  const hash = hashInviteToken(token);
  const companyId = await asViewer(viewer, async (tx) => {
    const [row] = await tx.execute<{ company_id: string | null }>(
      sql`select app.accept_employer_invite(${hash}) as company_id`,
    );
    return row?.company_id ?? null;
  });
  if (companyId) {
    await asViewer(
      { ...viewer, roles: [...new Set([...viewer.roles, 'employer' as const])] },
      (tx) =>
        audit(tx, {
          actorId: viewer.id,
          action: 'team.invite_accepted',
          targetType: 'company',
          targetId: companyId,
        }),
    );
    return { ok: true, companyId };
  }
  const [inv] = await adminDb()
    .select()
    .from(employerInvites)
    .where(eq(employerInvites.tokenHash, hash))
    .limit(1);
  if (!inv) return { ok: false, reason: 'unknown' };
  if (inv.acceptedAt) return { ok: false, reason: 'used' };
  if (inv.revokedAt) return { ok: false, reason: 'revoked' };
  if (inv.expiresAt <= new Date()) return { ok: false, reason: 'expired' };
  return { ok: false, reason: 'wrong_email' };
}

/** For the accept page: which company, and which email the invitation is for (masked). */
export async function describeInvite(token: string) {
  const [inv] = await adminDb()
    .select({
      email: employerInvites.email,
      expiresAt: employerInvites.expiresAt,
      acceptedAt: employerInvites.acceptedAt,
      revokedAt: employerInvites.revokedAt,
      inviter: users.displayName,
      company: companies.name,
    })
    .from(employerInvites)
    .innerJoin(users, eq(users.id, employerInvites.invitedBy))
    .innerJoin(companies, eq(companies.id, employerInvites.companyId))
    .where(eq(employerInvites.tokenHash, hashInviteToken(token)))
    .limit(1);
  if (!inv) return null;
  const [name, domain] = inv.email.split('@');
  return {
    maskedEmail: `${name!.slice(0, 1)}${'•'.repeat(Math.max(1, name!.length - 1))}@${domain}`,
    inviter: inv.inviter,
    company: inv.company,
    open: !inv.acceptedAt && !inv.revokedAt && inv.expiresAt > new Date(),
  };
}
