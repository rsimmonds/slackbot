import { sessionStateAad } from '@cmobeat/ai/interview';
import 'server-only';
import {
  adminDb,
  applications,
  audit,
  auditLog,
  candidateProfiles,
  companies,
  consents,
  dataRequests,
  decryptField,
  decryptJson,
  emailOutbox,
  employerMembers,
  files,
  interviewSessions,
  profileBlocklist,
  profileOutcomes,
  savedSearches,
  subscribers,
  userRoles,
  users,
  type Tx,
} from '@cmobeat/db';
import { sendEmail } from '@cmobeat/email';
import { and, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { Viewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { appUrl, button, layout } from '@/emails/layout';
import { ProfileError } from '@/lib/profile/profile';
import { storage } from '@/lib/storage';

/**
 * Self-serve data rights (spec 9.5): export everything, or delete permanently within 30 days.
 * Requests are created by the person (RLS); the jobs below complete them as the system.
 */

export const DELETE_GRACE_DAYS = 7;
export const REQUEST_DUE_DAYS = 30;
export const RETENTION_MONTHS = 24;
export const EXPORT_KEEP_DAYS = 30;

const days = (n: number) => n * 24 * 60 * 60 * 1000;

export type DataRequest = typeof dataRequests.$inferSelect;

export async function myDataRequests(viewer: Viewer): Promise<DataRequest[]> {
  return asViewer(viewer, (tx) =>
    tx
      .select()
      .from(dataRequests)
      .where(eq(dataRequests.userId, viewer.id))
      .orderBy(desc(dataRequests.createdAt))
      .limit(20),
  );
}

export async function requestExport(viewer: Viewer, now = new Date()): Promise<DataRequest> {
  return asViewer(viewer, async (tx) => {
    const [pending] = await tx
      .select()
      .from(dataRequests)
      .where(
        and(
          eq(dataRequests.userId, viewer.id),
          eq(dataRequests.kind, 'export'),
          eq(dataRequests.status, 'pending'),
        ),
      );
    if (pending) return pending;
    const [row] = await tx
      .insert(dataRequests)
      .values({
        userId: viewer.id,
        kind: 'export',
        dueAt: new Date(now.getTime() + days(REQUEST_DUE_DAYS)),
      })
      .returning();
    await audit(tx, {
      actorId: viewer.id,
      action: 'data.export.request',
      targetType: 'data_request',
      targetId: row!.id,
    });
    return row!;
  });
}

// ---------------------------------------------------------------- anonymize (shared by delete + retention)

/** Strip a candidate profile to nothing identifiable and make it invisible. Works on any Tx. */
async function anonymizeProfile(tx: Tx, profileId: string, ownerId: string, now: Date) {
  await tx.delete(profileOutcomes).where(eq(profileOutcomes.profileId, profileId));
  await tx
    .update(candidateProfiles)
    .set({
      visibility: 'hidden',
      headline: null,
      yearsExperience: null,
      level: null,
      compFloor: null,
      resumeRef: null,
      contact: null,
      idealMandate: null,
      locations: [],
      updatedAt: now,
    })
    .where(eq(candidateProfiles.id, profileId));
  await tx
    .update(consents)
    .set({ withdrawnAt: now, updatedAt: now })
    .where(and(eq(consents.subjectUserId, ownerId), isNull(consents.withdrawnAt)));
}

// ---------------------------------------------------------------- delete

export interface DeletionRequested {
  request: DataRequest;
  graceEndsAt: Date;
}

/**
 * Immediately hides and anonymizes the profile, removes uploads, ends interview sessions and
 * withdraws consents; the account itself is permanently deleted after a 7-day grace window
 * (and always within 30 days).
 */
export async function requestDeletion(
  viewer: Viewer,
  confirm: string,
  now = new Date(),
): Promise<DeletionRequested> {
  if (confirm.trim().toLowerCase() !== 'delete')
    throw new ProfileError('Type "delete" to confirm.', 422);
  return asViewer(viewer, async (tx) => {
    const [existing] = await tx
      .select()
      .from(dataRequests)
      .where(
        and(
          eq(dataRequests.userId, viewer.id),
          eq(dataRequests.kind, 'delete'),
          eq(dataRequests.status, 'pending'),
        ),
      );
    const request =
      existing ??
      (
        await tx
          .insert(dataRequests)
          .values({
            userId: viewer.id,
            kind: 'delete',
            dueAt: new Date(now.getTime() + days(REQUEST_DUE_DAYS)),
          })
          .returning()
      )[0]!;

    const [profile] = await tx
      .select({ id: candidateProfiles.id })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, viewer.id));
    if (profile) await anonymizeProfile(tx, profile.id, viewer.id, now);
    for (const f of await tx
      .select({ id: files.id })
      .from(files)
      .where(eq(files.ownerId, viewer.id)))
      await storage().remove(tx, f.id);
    await tx
      .update(interviewSessions)
      .set({ status: 'abandoned', updatedAt: now })
      .where(
        and(
          eq(interviewSessions.ownerId, viewer.id),
          inArray(interviewSessions.status, ['active', 'paused']),
        ),
      );
    await tx
      .update(consents)
      .set({ withdrawnAt: now, updatedAt: now })
      .where(and(eq(consents.subjectUserId, viewer.id), isNull(consents.withdrawnAt)));
    await audit(tx, {
      actorId: viewer.id,
      action: 'data.delete.request',
      targetType: 'data_request',
      targetId: request.id,
    });
    return {
      request,
      graceEndsAt: new Date(request.createdAt.getTime() + days(DELETE_GRACE_DAYS)),
    };
  });
}

/** Cancel a pending deletion during the grace window. Anonymized profile data stays anonymized. */
export async function cancelDeletion(viewer: Viewer, now = new Date()): Promise<boolean> {
  return asViewer(viewer, async (tx) => {
    const [pending] = await tx
      .select()
      .from(dataRequests)
      .where(
        and(
          eq(dataRequests.userId, viewer.id),
          eq(dataRequests.kind, 'delete'),
          eq(dataRequests.status, 'pending'),
        ),
      );
    if (!pending) return false;
    if (pending.createdAt.getTime() + days(DELETE_GRACE_DAYS) <= now.getTime())
      throw new ProfileError('The grace period has ended. Deletion is in progress.', 409);
    await tx
      .update(dataRequests)
      .set({ status: 'cancelled', updatedAt: now })
      .where(eq(dataRequests.id, pending.id));
    await audit(tx, {
      actorId: viewer.id,
      action: 'data.delete.cancel',
      targetType: 'data_request',
      targetId: pending.id,
    });
    return true;
  });
}

/**
 * Permanently delete a user (system). Deletes owned data, then the user row. If the person
 * authored records others rely on (published articles, moderation decisions), the user row is
 * anonymized instead of deleted. audit_log is append-only by design: entries keep the actor's
 * id, which no longer resolves to anyone once the user row is gone or anonymized.
 */
export async function hardDeleteUser(
  userId: string,
  now = new Date(),
): Promise<'deleted' | 'anonymized'> {
  return adminDb().transaction(async (tx) => {
    const [user] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId));
    // interview_sessions → candidate_profiles has no cascade, so sessions go first.
    await tx.delete(interviewSessions).where(eq(interviewSessions.ownerId, userId));
    await tx.delete(candidateProfiles).where(eq(candidateProfiles.userId, userId)); // cascades outcomes, blocklist, applications, matches
    await tx.delete(files).where(eq(files.ownerId, userId));
    await tx.delete(savedSearches).where(eq(savedSearches.userId, userId));
    await tx.delete(employerMembers).where(eq(employerMembers.userId, userId));
    if (user) {
      await tx.delete(subscribers).where(eq(subscribers.email, user.email));
      await tx.delete(emailOutbox).where(eq(emailOutbox.toEmail, user.email));
    }
    try {
      await tx.transaction(async (sp) => {
        await sp.delete(users).where(eq(users.id, userId));
      });
      return 'deleted';
    } catch {
      await tx.delete(userRoles).where(eq(userRoles.userId, userId));
      await tx
        .update(users)
        .set({
          email: `deleted+${userId}@invalid.cmobeat`,
          displayName: 'Deleted user',
          authProviderId: null,
          deletedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, userId));
      return 'anonymized';
    }
  });
}

/** Daily: permanently delete accounts whose grace window has passed. */
export async function runDataDeletions({ now = new Date() } = {}) {
  const due = await adminDb()
    .select()
    .from(dataRequests)
    .where(
      and(
        eq(dataRequests.kind, 'delete'),
        eq(dataRequests.status, 'pending'),
        lt(dataRequests.createdAt, new Date(now.getTime() - days(DELETE_GRACE_DAYS))),
      ),
    );
  const results: { requestId: string; outcome: 'deleted' | 'anonymized' }[] = [];
  for (const r of due) {
    const outcome = await hardDeleteUser(r.userId, now);
    await adminDb()
      .update(dataRequests)
      .set({ status: 'completed', completedAt: now, updatedAt: now })
      .where(eq(dataRequests.id, r.id));
    await audit(adminDb(), {
      actorId: null,
      action: 'data.delete.complete',
      targetType: 'data_request',
      targetId: r.id,
      metadata: { outcome },
    });
    results.push({ requestId: r.id, outcome });
  }
  return results;
}

// ---------------------------------------------------------------- export

const safeDecrypt = async (blob: Buffer | null, aad: string) => {
  if (!blob) return null;
  try {
    return await decryptField(blob, { aad });
  } catch {
    return '[could not be decrypted]';
  }
};

/** Everything we hold about a person, decrypted, as one JSON document. */
export async function buildExport(userId: string, now = new Date()) {
  const db = adminDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error('User not found');
  const roles = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  const [profile] = await db
    .select()
    .from(candidateProfiles)
    .where(eq(candidateProfiles.userId, userId));
  const outcomes = profile
    ? await db.select().from(profileOutcomes).where(eq(profileOutcomes.profileId, profile.id))
    : [];
  const blocklist = profile
    ? await db
        .select({ company: companies.name })
        .from(profileBlocklist)
        .innerJoin(companies, eq(companies.id, profileBlocklist.companyId))
        .where(eq(profileBlocklist.profileId, profile.id))
    : [];
  const sessions = await db
    .select()
    .from(interviewSessions)
    .where(eq(interviewSessions.ownerId, userId));
  const fileRows = await db
    .select()
    .from(files)
    .where(and(eq(files.ownerId, userId), sql`${files.purpose} <> 'data_export'`));
  const consentRows = await db.select().from(consents).where(eq(consents.subjectUserId, userId));
  const apps = profile
    ? await db.select().from(applications).where(eq(applications.profileId, profile.id))
    : [];
  const searches = await db.select().from(savedSearches).where(eq(savedSearches.userId, userId));
  const subs = await db
    .select({
      email: subscribers.email,
      status: subscribers.status,
      segments: subscribers.segments,
      preferences: subscribers.preferences,
      consentAt: subscribers.consentAt,
      consentText: subscribers.consentText,
    })
    .from(subscribers)
    .where(eq(subscribers.email, user.email));
  const requests = await db.select().from(dataRequests).where(eq(dataRequests.userId, userId));
  const auditRows = await db
    .select({
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      at: auditLog.at,
      actorIsYou: sql<boolean>`${auditLog.actorId} = ${userId}`,
    })
    .from(auditLog)
    .where(
      or(
        eq(auditLog.actorId, userId),
        eq(auditLog.targetId, userId),
        ...(profile ? [eq(auditLog.targetId, profile.id)] : []),
      ),
    )
    .orderBy(desc(auditLog.at))
    .limit(5000);

  return {
    exportedAt: now.toISOString(),
    about: 'Everything CMO Beat holds about you. Encrypted fields are decrypted for you here.',
    account: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      dataRegion: user.dataRegion,
      createdAt: user.createdAt,
      roles: roles.map((r) => r.role),
    },
    candidateProfile: profile
      ? {
          id: profile.id,
          visibility: profile.visibility,
          headline: profile.headline,
          level: profile.level,
          yearsExperience: profile.yearsExperience,
          workTypes: profile.workTypes,
          locations: profile.locations,
          idealMandate: profile.idealMandate,
          aiNoticeAcknowledgedAt: profile.aiNoticeAckAt,
          compFloor: await safeDecrypt(
            profile.compFloor,
            `candidate_profiles.comp_floor:${profile.id}`,
          ),
          contact: await safeDecrypt(profile.contact, `candidate_profiles.contact:${profile.id}`),
          uploadsAndContext: await safeDecrypt(
            profile.resumeRef,
            `candidate_profiles.resume_ref:${profile.id}`,
          ),
          outcomes: outcomes.map(({ profileId: _p, ...o }) => o),
          blocklist: blocklist.map((b) => b.company),
        }
      : null,
    interviewSessions: await Promise.all(
      sessions.map(async (s) => ({
        id: s.id,
        reference: s.publicRef,
        kind: s.kind,
        status: s.status,
        createdAt: s.createdAt,
        state: s.transcript
          ? await decryptJson<unknown>(s.transcript, { aad: sessionStateAad(s.id) }).catch(
              () => '[could not be decrypted]',
            )
          : null,
        mandateDraft: s.draftOutput,
      })),
    ),
    files: await Promise.all(
      fileRows.map(async (f) => ({
        id: f.id,
        purpose: f.purpose,
        filename: await safeDecrypt(f.filename, `file:${f.id}`),
        sizeBytes: f.sizeBytes,
        uploadedAt: f.createdAt,
        deletedAt: f.deletedAt,
        note: 'The file itself can be downloaded from your account while it is stored.',
      })),
    ),
    consents: consentRows.map((c) => ({
      kind: c.kind,
      scope: c.scope,
      grantedAt: c.grantedAt,
      withdrawnAt: c.withdrawnAt,
    })),
    applications: apps.map((a) => ({
      listingId: a.listingId,
      status: a.status,
      createdAt: a.createdAt,
    })),
    savedSearches: searches.map((s) => ({
      name: s.name,
      query: s.query,
      alertFrequency: s.alertFrequency,
      createdAt: s.createdAt,
    })),
    newsletter: subs,
    dataRequests: requests.map((r) => ({
      kind: r.kind,
      status: r.status,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    })),
    activity: auditRows,
  };
}

function exportReadyEmail() {
  const url = `${appUrl()}/account/data`;
  const { html, text } = layout({
    preheader: 'Your data export is ready.',
    heading: 'Your data export is ready',
    bodyHtml: `<p style="font-size:16px;line-height:1.6;color:#5A6068;margin:0">Sign in to download it. For your security the file is only available from your account, through a link that expires after a few minutes. It is kept for 30 days.</p>${button(url, 'Open your data page')}`,
    bodyText: `Sign in to download it: ${url}\nThe file is only available from your account and is kept for 30 days.`,
    footerNote: 'You receive this because you asked for a copy of your data.',
  });
  return { subject: 'Your CMO Beat data export is ready', html, text };
}

/** Daily (and on demand): build pending exports, store them encrypted, email the person. */
export async function runDataExports({ now = new Date() } = {}) {
  const pending = await adminDb()
    .select()
    .from(dataRequests)
    .where(and(eq(dataRequests.kind, 'export'), eq(dataRequests.status, 'pending')));
  const done: string[] = [];
  for (const r of pending) {
    const archive = await buildExport(r.userId, now);
    const fileId = await adminDb().transaction(async (tx) => {
      const f = await storage().put(tx, {
        ownerId: r.userId,
        purpose: 'data_export',
        filename: `cmobeat-export-${now.toISOString().slice(0, 10)}.json`,
        mimeType: 'application/json',
        bytes: Buffer.from(JSON.stringify(archive, null, 2), 'utf8'),
      });
      await tx
        .update(dataRequests)
        .set({ status: 'completed', completedAt: now, resultFileId: f.id, updatedAt: now })
        .where(eq(dataRequests.id, r.id));
      await audit(tx, {
        actorId: null,
        action: 'data.export.complete',
        targetType: 'data_request',
        targetId: r.id,
      });
      return f.id;
    });
    const email = exportReadyEmail();
    await sendEmail({
      to: archive.account.email,
      template: 'data-export-ready',
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    done.push(fileId);
  }
  return done;
}

// ---------------------------------------------------------------- retention

/**
 * Daily: anonymize candidate profiles inactive for 24 months (spec 9.5), and remove export
 * archives older than 30 days. Sample data is left alone.
 */
export async function runProfileRetention({ now = new Date() } = {}) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
  const stale = await adminDb()
    .select({ id: candidateProfiles.id, userId: candidateProfiles.userId })
    .from(candidateProfiles)
    .where(
      and(
        eq(candidateProfiles.isSample, false),
        or(
          isNotNull(candidateProfiles.headline),
          isNotNull(candidateProfiles.resumeRef),
          isNotNull(candidateProfiles.idealMandate),
        ),
        sql`coalesce(${candidateProfiles.lastActiveAt}, ${candidateProfiles.updatedAt}) < ${cutoff.toISOString()}::timestamptz`,
      ),
    );
  for (const p of stale) {
    await adminDb().transaction(async (tx) => {
      await anonymizeProfile(tx, p.id, p.userId, now);
      await tx
        .update(files)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(files.ownerId, p.userId), isNull(files.deletedAt)));
      await audit(tx, {
        actorId: null,
        action: 'profile.retention.anonymize',
        targetType: 'candidate_profile',
        targetId: p.id,
      });
    });
  }
  const oldExports = await adminDb()
    .delete(files)
    .where(
      and(
        eq(files.purpose, 'data_export'),
        lt(files.createdAt, new Date(now.getTime() - days(EXPORT_KEEP_DAYS))),
      ),
    )
    .returning({ id: files.id });
  return { anonymized: stale.length, exportsRemoved: oldExports.length };
}

/** The latest completed export the person can still download. */
export async function latestExport(viewer: Viewer) {
  return asViewer(viewer, async (tx) => {
    const [row] = await tx
      .select({ id: files.id, createdAt: files.createdAt, sizeBytes: files.sizeBytes })
      .from(files)
      .where(
        and(
          eq(files.ownerId, viewer.id),
          eq(files.purpose, 'data_export'),
          isNull(files.deletedAt),
        ),
      )
      .orderBy(desc(files.createdAt))
      .limit(1);
    return row ?? null;
  });
}
