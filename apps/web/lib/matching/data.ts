import 'server-only';
import type { Market } from '@cmobeat/config';
import {
  levelCompatibility,
  marketsFromLocations,
  type CandidateFacts,
  type CompFloor,
  type Level,
  type MandateFacts,
  type RawIdeal,
  type RawProfileForBlind,
} from '@cmobeat/ai/matching';
import type { BlindMandate } from '@cmobeat/ai/schemas';
import {
  adminDb,
  candidateProfiles,
  companies,
  decryptJson,
  mandates,
  matches,
  profileBlocklist,
  profileOutcomes,
  users,
} from '@cmobeat/db';
import { and, eq, inArray, isNotNull, isNull, notExists, sql } from 'drizzle-orm';

/**
 * Reads for the matching pipeline. These run on the system connection because matching looks
 * across candidates; they live only here, read only what matching needs, and never log
 * candidate data. Everything that leaves this module is blind (see @cmobeat/ai/matching).
 */

export interface MandateForMatching {
  id: string;
  companyId: string;
  facts: MandateFacts;
  blind: BlindMandate;
  confirmed: boolean;
}

export async function loadMandate(id: string): Promise<MandateForMatching | null> {
  const [row] = await adminDb()
    .select({ m: mandates, industry: companies.industry, stage: companies.stage })
    .from(mandates)
    .innerJoin(companies, eq(companies.id, mandates.companyId))
    .where(and(eq(mandates.id, id), isNull(mandates.deletedAt)))
    .limit(1);
  if (!row) return null;
  const m = row.m;
  const doc = (m.document ?? {}) as { summary?: unknown };
  return {
    id: m.id,
    companyId: m.companyId,
    confirmed: m.confirmedAt !== null,
    facts: {
      level: m.level as Level,
      workType: m.workType,
      market: m.market,
      remote: m.remote,
      compMax: m.compMax,
      currency: m.currency,
      compBasis: m.compBasis,
    },
    blind: {
      title: m.title,
      level: m.level as Level,
      workType: m.workType,
      market: m.market,
      companyStage: row.stage,
      companyIndustry: row.industry,
      summary: typeof doc.summary === 'string' ? doc.summary : m.scope,
      priorities: (m.priorities ?? []).slice(0, 8),
      reportingLine: m.reportingLine,
      teamSize: m.teamSize,
    },
  };
}

export interface PoolCandidate {
  profileId: string;
  facts: CandidateFacts;
  raw: RawProfileForBlind;
}

let companyNamesCache: { at: number; names: string[] } | undefined;
async function allCompanyNames(): Promise<string[]> {
  if (companyNamesCache && Date.now() - companyNamesCache.at < 5 * 60_000)
    return companyNamesCache.names;
  const rows = await adminDb().select({ name: companies.name }).from(companies);
  companyNamesCache = { at: Date.now(), names: rows.map((r) => r.name) };
  return companyNamesCache.names;
}

async function decryptFloor(profileId: string, blob: Buffer | null): Promise<CompFloor | null> {
  if (!blob) return null;
  try {
    const v = await decryptJson<CompFloor>(blob, {
      aad: `candidate_profiles.comp_floor:${profileId}`,
    });
    return typeof v?.amount === 'number' && v.currency && v.basis ? v : null;
  } catch {
    return null; // unreadable floor: treat as unstated rather than excluding the candidate
  }
}

/**
 * Stage-one candidates for a mandate, before the JS hard filter: visible (anonymous or open),
 * not deleted, level-compatible, not blocklisting the mandate's company, and not already matched
 * to this mandate (in any status, so a rejected match is never re-proposed).
 */
export async function loadPool(
  mandate: MandateForMatching,
  onlyProfileIds?: string[],
): Promise<PoolCandidate[]> {
  const db = adminDb();
  const rows = await db
    .select({
      id: candidateProfiles.id,
      level: candidateProfiles.level,
      workTypes: candidateProfiles.workTypes,
      locations: candidateProfiles.locations,
      idealMandate: candidateProfiles.idealMandate,
      compFloor: candidateProfiles.compFloor,
      currentCompanyId: candidateProfiles.currentCompanyId,
      name: users.displayName,
    })
    .from(candidateProfiles)
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(
      and(
        inArray(candidateProfiles.visibility, ['anonymous', 'open']),
        isNull(candidateProfiles.deletedAt),
        isNull(users.deletedAt),
        isNotNull(candidateProfiles.level),
        inArray(candidateProfiles.level, [...levelCompatibility[mandate.facts.level]]),
        onlyProfileIds?.length ? inArray(candidateProfiles.id, onlyProfileIds) : undefined,
        notExists(
          db
            .select({ one: sql`1` })
            .from(profileBlocklist)
            .where(
              and(
                eq(profileBlocklist.profileId, candidateProfiles.id),
                eq(profileBlocklist.companyId, mandate.companyId),
              ),
            ),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(matches)
            .where(
              and(eq(matches.profileId, candidateProfiles.id), eq(matches.mandateId, mandate.id)),
            ),
        ),
      ),
    );
  if (!rows.length) return [];

  const outcomes = await loadOutcomes(rows.map((r) => r.id));
  const companyNames = await allCompanyNames();
  return Promise.all(
    rows.map(async (r) => {
      const ideal = (r.idealMandate ?? null) as RawIdeal | null;
      const loc = marketsFromLocations(r.locations ?? []);
      const markets: Market[] = ideal?.markets?.length ? ideal.markets : loc.markets;
      const workTypes = ideal?.workTypes?.length ? ideal.workTypes : (r.workTypes ?? []);
      return {
        profileId: r.id,
        facts: {
          level: r.level as Level,
          workTypes,
          markets,
          remoteOk: loc.remote,
          compFloor: await decryptFloor(r.id, r.compFloor),
        },
        raw: {
          level: r.level as Level,
          outcomes: outcomes.get(r.id) ?? [],
          ideal,
          workTypes,
          markets,
          identifiers: [r.name, ...companyNames],
        },
      };
    }),
  );
}

/** Approved outcomes only: lines the candidate signed off. */
export async function loadOutcomes(profileIds: string[]) {
  const rows = await adminDb()
    .select({
      profileId: profileOutcomes.profileId,
      outcomeType: profileOutcomes.outcomeType,
      metric: profileOutcomes.metric,
      value: profileOutcomes.value,
      context: profileOutcomes.context,
    })
    .from(profileOutcomes)
    .where(
      and(
        inArray(profileOutcomes.profileId, profileIds),
        isNotNull(profileOutcomes.candidateApprovedAt),
      ),
    );
  const by = new Map<string, RawProfileForBlind['outcomes']>();
  for (const r of rows) {
    const list = by.get(r.profileId) ?? [];
    list.push({ outcomeType: r.outcomeType, metric: r.metric, value: r.value, context: r.context });
    by.set(r.profileId, list);
  }
  return by;
}

/** A single candidate's blind input, for embedding refresh (no mandate needed). */
export async function loadProfileForBlind(profileId: string): Promise<RawProfileForBlind | null> {
  const [r] = await adminDb()
    .select({
      level: candidateProfiles.level,
      workTypes: candidateProfiles.workTypes,
      locations: candidateProfiles.locations,
      idealMandate: candidateProfiles.idealMandate,
      name: users.displayName,
    })
    .from(candidateProfiles)
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(and(eq(candidateProfiles.id, profileId), isNull(candidateProfiles.deletedAt)))
    .limit(1);
  if (!r?.level) return null;
  const outcomes = (await loadOutcomes([profileId])).get(profileId) ?? [];
  const ideal = (r.idealMandate ?? null) as RawIdeal | null;
  const loc = marketsFromLocations(r.locations ?? []);
  return {
    level: r.level as Level,
    outcomes,
    ideal,
    workTypes: ideal?.workTypes?.length ? ideal.workTypes : (r.workTypes ?? []),
    markets: ideal?.markets?.length ? ideal.markets : loc.markets,
    identifiers: [r.name, ...(await allCompanyNames())],
  };
}
