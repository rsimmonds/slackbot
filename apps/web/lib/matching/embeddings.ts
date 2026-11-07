import 'server-only';
import { defaultEmbeddings, type EmbeddingsProvider } from '@cmobeat/ai/embeddings';
import { blindMandateText, blindProfileText, buildBlindProfile } from '@cmobeat/ai/matching';
import {
  adminDb,
  articles,
  candidateProfiles,
  embeddings,
  mandates,
  profileOutcomes,
} from '@cmobeat/db';
import { and, eq, inArray, isNotNull, isNull, max, ne, or, sql } from 'drizzle-orm';
import { loadMandate, loadProfileForBlind } from './data';

/**
 * Embedding refresh (spec 7.1.5, 8.2). Vectors are computed from BLIND text only, so nothing
 * identifying or protected is ever embedded. One row per (owner_type, owner_id, kind).
 */
export const OWNER = {
  mandate: { ownerType: 'mandate', kind: 'mandate' },
  profile: { ownerType: 'profile_outcomes', kind: 'profile' },
  article: { ownerType: 'article', kind: 'article' },
} as const;

async function upsert(
  owner: (typeof OWNER)[keyof typeof OWNER],
  ownerId: string,
  vector: number[],
  model: string,
) {
  await adminDb()
    .insert(embeddings)
    .values({ ...owner, ownerId, vector, model })
    .onConflictDoUpdate({
      target: [embeddings.ownerType, embeddings.ownerId, embeddings.kind],
      set: { vector, model, updatedAt: new Date() },
    });
}

export async function refreshMandateEmbedding(
  mandateId: string,
  provider: EmbeddingsProvider = defaultEmbeddings(),
): Promise<number[] | null> {
  const m = await loadMandate(mandateId);
  if (!m) return null;
  const [vector] = await provider.embed([blindMandateText(m.blind)], 'query');
  await upsert(OWNER.mandate, mandateId, vector!, provider.model);
  return vector!;
}

/** Re-embed profiles. Skips any whose vector is current unless `force`. Returns ids refreshed. */
export async function refreshProfileEmbeddings(
  profileIds: string[],
  opts: { force?: boolean; provider?: EmbeddingsProvider } = {},
): Promise<string[]> {
  if (!profileIds.length) return [];
  const provider = opts.provider ?? defaultEmbeddings();
  const stale = opts.force ? profileIds : await staleProfiles(profileIds, provider.model);
  const done: string[] = [];
  for (let i = 0; i < stale.length; i += 32) {
    const chunk = stale.slice(i, i + 32);
    const texts: { id: string; text: string }[] = [];
    for (const id of chunk) {
      const raw = await loadProfileForBlind(id);
      if (raw) texts.push({ id, text: blindProfileText(buildBlindProfile(raw, 'P000000')) });
    }
    if (!texts.length) continue;
    const vectors = await provider.embed(
      texts.map((t) => t.text),
      'document',
    );
    for (const [j, t] of texts.entries()) {
      await upsert(OWNER.profile, t.id, vectors[j]!, provider.model);
      done.push(t.id);
    }
  }
  return done;
}

/** Profiles with no vector, a vector from another model, or edits since it was computed. */
async function staleProfiles(profileIds: string[], model: string): Promise<string[]> {
  const db = adminDb();
  const latestOutcome = db
    .select({ profileId: profileOutcomes.profileId, at: max(profileOutcomes.updatedAt).as('at') })
    .from(profileOutcomes)
    .where(inArray(profileOutcomes.profileId, profileIds))
    .groupBy(profileOutcomes.profileId)
    .as('lo');
  const rows = await db
    .select({ id: candidateProfiles.id })
    .from(candidateProfiles)
    .leftJoin(
      embeddings,
      and(
        eq(embeddings.ownerId, candidateProfiles.id),
        eq(embeddings.ownerType, OWNER.profile.ownerType),
        eq(embeddings.kind, OWNER.profile.kind),
      ),
    )
    .leftJoin(latestOutcome, eq(latestOutcome.profileId, candidateProfiles.id))
    .where(
      and(
        inArray(candidateProfiles.id, profileIds),
        or(
          isNull(embeddings.id),
          ne(embeddings.model, model),
          sql`${embeddings.updatedAt} < ${candidateProfiles.updatedAt}`,
          sql`${embeddings.updatedAt} < ${latestOutcome.at}`,
        ),
      ),
    );
  return rows.map((r) => r.id);
}

export async function refreshArticleEmbedding(
  articleId: string,
  provider: EmbeddingsProvider = defaultEmbeddings(),
) {
  const [a] = await adminDb()
    .select({ title: articles.title, dek: articles.dek, body: articles.bodyMdx })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);
  if (!a) return;
  const text = [a.title, a.dek ?? '', a.body.slice(0, 6000)].join('\n');
  const [vector] = await provider.embed([text], 'document');
  await upsert(OWNER.article, articleId, vector!, provider.model);
}

/**
 * Nightly sweep: anything missing, computed by another model, or edited since. Covers visible
 * profiles, confirmed mandates and published articles.
 */
export async function refreshStaleEmbeddings(provider: EmbeddingsProvider = defaultEmbeddings()) {
  const db = adminDb();
  const profiles = await db
    .select({ id: candidateProfiles.id })
    .from(candidateProfiles)
    .where(
      and(
        inArray(candidateProfiles.visibility, ['anonymous', 'open']),
        isNull(candidateProfiles.deletedAt),
      ),
    );
  const refreshedProfiles = await refreshProfileEmbeddings(
    profiles.map((p) => p.id),
    { provider },
  );

  const staleOf = async (
    table: typeof mandates | typeof articles,
    owner: (typeof OWNER)['mandate' | 'article'],
    where: ReturnType<typeof and>,
  ) =>
    db
      .select({ id: table.id })
      .from(table)
      .leftJoin(
        embeddings,
        and(
          eq(embeddings.ownerId, table.id),
          eq(embeddings.ownerType, owner.ownerType),
          eq(embeddings.kind, owner.kind),
        ),
      )
      .where(
        and(
          where,
          or(
            isNull(embeddings.id),
            ne(embeddings.model, provider.model),
            sql`${embeddings.updatedAt} < ${table.updatedAt}`,
          ),
        ),
      );

  const staleMandates = await staleOf(
    mandates,
    OWNER.mandate,
    and(isNotNull(mandates.confirmedAt), isNull(mandates.deletedAt)),
  );
  for (const m of staleMandates) await refreshMandateEmbedding(m.id, provider);

  const staleArticles = await staleOf(
    articles,
    OWNER.article,
    and(eq(articles.status, 'published'), isNull(articles.deletedAt)),
  );
  for (const a of staleArticles) await refreshArticleEmbedding(a.id, provider);

  return {
    profiles: refreshedProfiles.length,
    mandates: staleMandates.length,
    articles: staleArticles.length,
  };
}
