import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { defaultCurrency, type Currency, type Market } from '@cmobeat/config';
import { adminDb, closeDb, type Db } from '../client';
import { encryptField, encryptJson } from '../crypto';
import { loadRootEnv } from '../env';
import * as s from '../schema';
import { sampleArticles } from './articles';
import {
  firstNames,
  lastNames,
  outcomeTemplates,
  priorityPool,
  reportingLines,
  sampleCompanies,
} from './data';
import { devUsers } from './dev-users';
import { createRng } from './rng';

/**
 * Seeds an empty database with clearly marked sample data:
 * 40 companies, 60 CMO profiles, 30 listings, 12 articles, 28 moves, and one dev user per role.
 * Everything is fictional and flagged is_sample = true.
 */
/** Plausible sample cities per HQ country, so listings read like real ones. */
const sampleCities: Record<string, string[]> = {
  US: ['New York, NY', 'San Francisco, CA', 'Austin, TX', 'Boston, MA', 'Chicago, IL'],
  CA: ['Toronto, ON', 'Vancouver, BC', 'Montréal, QC'],
  GB: ['London', 'Manchester'],
  SE: ['Stockholm'],
  NL: ['Amsterdam'],
  DE: ['Berlin', 'Munich'],
  FR: ['Paris'],
  ES: ['Madrid', 'Barcelona'],
  IE: ['Dublin'],
};
function cityFor(country: string, r: { pick<T>(xs: readonly T[]): T }): string {
  const options = sampleCities[country];
  return options ? r.pick(options) : country;
}

export async function seed(db: Db = adminDb()): Promise<SeedSummary> {
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(s.users);
  if (count > 0)
    throw new Error('Database already has users. Run `pnpm db:reset` to reseed from scratch.');

  const rng = createRng(20261107);
  const now = Date.now();
  const daysAgo = (d: number) => new Date(now - d * 86_400_000);
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);

  return db.transaction(async (tx) => {
    // ------------------------------------------------------------ companies
    const companies = await tx
      .insert(s.companies)
      .values(
        sampleCompanies.map((c) => ({
          name: c.name,
          domain: `${c.slug}.example`,
          industry: c.industry,
          stage: c.stage,
          sizeBand: c.size,
          hqCountry: c.country,
          market: c.market,
          isSample: true,
        })),
      )
      .returning();

    // ------------------------------------------------------------ dev users (one per role)
    await tx.insert(s.users).values(
      devUsers.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.name,
        isSample: true,
      })),
    );
    await tx
      .insert(s.userRoles)
      .values(devUsers.flatMap((u) => u.roles.map((role) => ({ userId: u.id, role }))));

    const devEmployer = devUsers.find((u) => u.roles.includes('employer'))!;
    const devEditor = devUsers.find((u) => u.roles.includes('editor'))!;
    const devCandidate = devUsers.find((u) => u.roles.includes('candidate'))!;
    const employerCompany = companies[0]!;
    await tx
      .insert(s.employerMembers)
      .values({ userId: devEmployer.id, companyId: employerCompany.id, seatRole: 'owner' });

    // Two sample staff writers, so bylines vary.
    const writers = await tx
      .insert(s.users)
      .values([
        { email: 'writer-1@sample.cmobeat.dev', displayName: 'Wren Ashdown', isSample: true },
        { email: 'writer-2@sample.cmobeat.dev', displayName: 'Jonah Pemberton', isSample: true },
      ])
      .returning();
    await tx
      .insert(s.userRoles)
      .values(writers.map((w) => ({ userId: w.id, role: 'editor' as const })));

    // ------------------------------------------------------------ candidates (60, incl. the dev candidate)
    const names = new Set<string>();
    const nextName = () => {
      for (;;) {
        const n = `${rng.pick(firstNames)} ${rng.pick(lastNames)}`;
        if (!names.has(n)) {
          names.add(n);
          return n;
        }
      }
    };

    const candidateUsers = [
      { id: devCandidate.id, email: devCandidate.email, name: devCandidate.name, existing: true },
      ...Array.from({ length: 59 }, (_, i) => ({
        id: randomUUID(),
        email: `cmo-${String(i + 1).padStart(2, '0')}@sample.cmobeat.dev`,
        name: nextName(),
        existing: false,
      })),
    ];
    const newCandidates = candidateUsers.filter((u) => !u.existing);
    const candidateRegion = new Map<string, 'us' | 'eu'>();
    const candidateCompany = new Map<string, (typeof companies)[number]>();
    for (const u of candidateUsers) {
      const company = rng.pick(companies);
      candidateCompany.set(u.id, company);
      candidateRegion.set(u.id, company.market === 'EU' || company.market === 'UK' ? 'eu' : 'us');
    }
    await tx.insert(s.users).values(
      newCandidates.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.name,
        dataRegion: candidateRegion.get(u.id)!,
        isSample: true,
      })),
    );
    await tx.insert(s.userRoles).values(
      newCandidates.flatMap((u) => [
        { userId: u.id, role: 'reader' as const },
        { userId: u.id, role: 'candidate' as const },
      ]),
    );

    const levels = [
      'cmo',
      'cmo',
      'cmo',
      'vp_marketing',
      'chief_growth_officer',
      'fractional_cmo',
    ] as const;
    const headlineFor = (level: string, industry: string, stage: string) => {
      const role = {
        cmo: 'CMO',
        vp_marketing: 'VP Marketing',
        chief_growth_officer: 'Chief Growth Officer',
        fractional_cmo: 'Fractional CMO',
      }[level];
      return `${role}, ${stage.toLowerCase()} ${industry.toLowerCase()}. ${rng.pick([
        'Built the demand engine from founder-led to repeatable.',
        'Led brand repositioning through a category shift.',
        'Took marketing through IPO readiness.',
        'Integrated two teams after an acquisition.',
        'Launched in two new regions in eighteen months.',
        'Rebuilt the marketing operating model around AI.',
      ])}`;
    };

    const profiles: { id: string; userId: string; companyId: string }[] = [];
    const profileRows = [];
    for (const [i, u] of candidateUsers.entries()) {
      const company = candidateCompany.get(u.id)!;
      const level = rng.pick(levels);
      const id = randomUUID();
      const visibility = u.existing
        ? 'hidden'
        : i % 5 === 0
          ? 'open'
          : i % 3 === 0
            ? 'anonymous'
            : 'hidden';
      const currency = defaultCurrency[company.market as Market];
      profiles.push({ id, userId: u.id, companyId: company.id });
      profileRows.push({
        id,
        userId: u.id,
        visibility: visibility as 'hidden' | 'anonymous' | 'open',
        headline: headlineFor(level, company.industry, company.stage),
        yearsExperience: rng.int(12, 28),
        currentCompanyId: company.id,
        level,
        workTypes: (level === 'fractional_cmo'
          ? ['fractional']
          : rng.chance(0.25)
            ? ['full_time', 'fractional']
            : ['full_time']) as ('full_time' | 'fractional')[],
        locations: [company.hqCountry, ...(rng.chance(0.4) ? ['Remote'] : [])],
        compFloor: await encryptJson(
          { amount: rng.int(22, 45) * 10_000, currency, basis: 'annual' },
          { aad: `candidate_profiles.comp_floor:${id}` },
        ),
        resumeRef: await encryptField(`sample/resumes/${id}.pdf`, {
          aad: `candidate_profiles.resume_ref:${id}`,
        }),
        contact: await encryptJson(
          { email: u.email, phone: `+1 555 01${String(i).padStart(2, '0')}` },
          { aad: `candidate_profiles.contact:${id}` },
        ),
        dataRegion: candidateRegion.get(u.id)!,
        lastActiveAt: daysAgo(rng.int(0, 120)),
        isSample: true,
      });
    }
    await tx.insert(s.candidateProfiles).values(profileRows);

    const outcomes = profiles.flatMap((p) =>
      rng.sample(outcomeTemplates, rng.int(3, 5)).map((t) => ({
        profileId: p.id,
        outcomeType: t.type,
        metric: t.metric,
        value: rng.pick(t.values),
        context: 'Sample outcome for template development.',
        evidenceNote: rng.pick([
          'Board deck, FY close',
          'Audited financials',
          'Company press release',
          'CRM export',
        ]),
        candidateApprovedAt: daysAgo(rng.int(1, 60)),
      })),
    );
    await tx.insert(s.profileOutcomes).values(outcomes);

    // Blocklist: current employer always, plus up to two others.
    const blocklist = profiles.flatMap((p) => {
      const others = rng
        .sample(
          companies.filter((c) => c.id !== p.companyId),
          rng.int(0, 2),
        )
        .map((c) => c.id);
      return [p.companyId, ...others].map((companyId) => ({ profileId: p.id, companyId }));
    });
    await tx.insert(s.profileBlocklist).values(blocklist);

    // ------------------------------------------------------------ mandates + listings (30)
    const listingLevels = [
      ...Array(12).fill('cmo'),
      ...Array(7).fill('vp_marketing'),
      ...Array(5).fill('chief_growth_officer'),
      ...Array(6).fill('fractional_cmo'),
    ] as ('cmo' | 'vp_marketing' | 'chief_growth_officer' | 'fractional_cmo')[];
    const titles = {
      cmo: 'Chief Marketing Officer',
      vp_marketing: 'VP Marketing',
      chief_growth_officer: 'Chief Growth Officer',
      fractional_cmo: 'Fractional CMO',
    };
    // Annual base bands (thousands) and monthly retainer bands (thousands), per currency.
    const annual: Record<Currency, [number, number]> = {
      USD: [350, 550],
      CAD: [260, 420],
      EUR: [220, 380],
      GBP: [200, 340],
    };
    const retainer: Record<Currency, [number, number]> = {
      USD: [12, 25],
      CAD: [14, 28],
      EUR: [9, 18],
      GBP: [8, 16],
    };

    let listingsCreated = 0;
    // The dev employer's company gets the first three listings so its dashboard has content later.
    const listingCompanies = [
      employerCompany,
      employerCompany,
      employerCompany,
      ...rng.shuffle(companies).slice(0, 27),
    ];
    for (const [i, level] of rng.shuffle(listingLevels).entries()) {
      const company = listingCompanies[i]!;
      const currency = defaultCurrency[company.market as Market];
      const fractional = level === 'fractional_cmo';
      const [lo, hi] = fractional ? retainer[currency] : annual[currency];
      const scale = level === 'vp_marketing' ? 0.7 : 1;
      const min = Math.round(rng.int(lo, Math.round((lo + hi) / 2)) * scale) * 1000;
      const max = Math.max(
        min + 1000,
        Math.round(rng.int(Math.round((lo + hi) / 2), hi) * scale) * 1000,
      );
      const priorities = rng.sample(priorityPool, 3);
      const [mandate] = await tx
        .insert(s.mandates)
        .values({
          companyId: company.id,
          source: 'listing',
          title: titles[level],
          level,
          scope: `Owns brand, demand, product marketing and marketing operations across ${company.market === 'EU' ? 'Europe' : company.market === 'UK' ? 'the UK and Ireland' : company.market === 'CA' ? 'Canada' : 'North America'}.`,
          reportingLine: rng.pick(reportingLines),
          teamSize: fractional ? rng.int(2, 8) : rng.int(8, 90),
          priorities,
          scorecard: {
            day30: 'Written view of core segments, tested with twenty customer conversations.',
            day60: 'Decisions on which programmes stop and which hires come first.',
            day90: `One visible result against: ${priorities[0]}.`,
          },
          interviewPlan: {
            stages: ['CEO conversation', 'Mandate working session', 'Board panel', 'References'],
          },
          compMin: min,
          compMax: max,
          currency,
          compBasis: fractional ? 'monthly_retainer' : 'annual',
          workType: fractional ? 'fractional' : 'full_time',
          location: cityFor(company.hqCountry, rng),
          remote: rng.chance(0.35),
          market: company.market,
          confirmedAt: daysAgo(rng.int(5, 80)),
          isSample: true,
        })
        .returning();
      const status = i < 26 ? 'live' : i < 28 ? 'pending_review' : 'expired';
      const published =
        status === 'live'
          ? daysAgo(rng.int(0, 45))
          : status === 'expired'
            ? daysAgo(rng.int(70, 100))
            : null;
      await tx.insert(s.listings).values({
        mandateId: mandate!.id,
        status,
        plan: i % 5 === 0 ? 'featured' : 'standard',
        featured: i % 5 === 0,
        publishedAt: published,
        expiresAt: published ? new Date(published.getTime() + 60 * 86_400_000) : null,
        isSample: true,
      });
      listingsCreated++;
    }

    // ------------------------------------------------------------ articles (12)
    const authorPool = [devEditor.id, ...writers.map((w) => w.id)];
    await tx.insert(s.articles).values(
      sampleArticles.map((a, i) => ({
        slug: a.slug,
        type: a.type,
        title: a.title,
        dek: a.dek,
        bodyMdx: a.body,
        media: a.media ?? null,
        chapters: a.chapters ?? null,
        authorId: authorPool[i % authorPool.length]!,
        editorId: devEditor.id,
        status: 'published' as const,
        publishedAt: daysAgo(a.daysAgo),
        isSample: true,
      })),
    );

    // ------------------------------------------------------------ moves (25 approved + 3 drafts)
    const moveTitles = [
      'Chief Marketing Officer',
      'Chief Growth Officer',
      'VP Marketing',
      'Chief Marketing & Communications Officer',
    ];
    const moveRows = Array.from({ length: 28 }, (_, i) => {
      const company = rng.pick(companies);
      const moveType = rng.pick(['appointed', 'appointed', 'departed', 'promoted'] as const);
      const effective = daysAgo(rng.int(1, 120));
      const slug = company.domain!;
      const sources = [
        {
          url: `https://${slug}/newsroom/${isoDate(effective)}-leadership`,
          label: 'Company newsroom',
          kind: 'newsroom',
        },
        ...(rng.chance(0.5)
          ? [
              {
                url: `https://wire.example/releases/${slug.replace('.example', '')}-${i}`,
                label: 'Press wire',
                kind: 'press_wire',
              },
            ]
          : []),
        ...(company.stage === 'Public' && rng.chance(0.7)
          ? [
              {
                url: `https://filings.example/8-k/${slug.replace('.example', '')}-${isoDate(effective)}`,
                label: 'Form 8-K, Item 5.02',
                kind: 'sec_8k',
              },
            ]
          : []),
      ];
      const approved = i < 25;
      return {
        personName: nextName(),
        companyId: company.id,
        moveType,
        title: rng.pick(moveTitles),
        effectiveDate: isoDate(effective),
        sources,
        confidence: Math.round((0.78 + rng.next() * 0.2) * 100) / 100,
        status: approved ? ('approved' as const) : ('draft' as const),
        approvedBy: approved ? devEditor.id : null,
        approvedAt: approved ? daysAgo(rng.int(0, 1)) : null,
        isSample: true,
      };
    });
    await tx.insert(s.moves).values(moveRows);

    return {
      companies: companies.length,
      users: candidateUsers.length + devUsers.length - 1 + writers.length,
      profiles: profiles.length,
      outcomes: outcomes.length,
      listings: listingsCreated,
      articles: sampleArticles.length,
      moves: moveRows.length,
    };
  });
}

export interface SeedSummary {
  companies: number;
  users: number;
  profiles: number;
  outcomes: number;
  listings: number;
  articles: number;
  moves: number;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadRootEnv();
  seed()
    .then((summary) => console.log('Seeded sample data:', summary))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
