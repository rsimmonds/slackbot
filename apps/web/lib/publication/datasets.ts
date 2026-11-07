import 'server-only';
import { brand } from '@cmobeat/config';
import { withAnon } from '@cmobeat/db';
import {
  compCells,
  listingStats,
  moveCountsBy,
  moveCountsByType,
  MIN_CELL,
  publicIndustries,
  type CompCell,
} from './aggregates';
import { marketLabel, type MarketCode, type MoveType } from './labels';

/**
 * One dataset per public data page. The page and its CSV are built from the same object, so a
 * quoted number always matches the downloadable one. Aggregates only; cells under MIN_CELL
 * listings are withheld.
 */
export interface Dataset {
  kind: 'industry' | 'market';
  key: string;
  name: string;
  path: string;
  moves: {
    total: number;
    byType: Record<MoveType, number>;
    breakdown: { key: string; n: number }[];
  };
  comp: { cells: CompCell[]; suppressed: number };
  board: { live: number; withComp: number; fractional: number; remote: number };
  asOf: string;
}

export async function industryDataset(slug: string, now = new Date()): Promise<Dataset | null> {
  const industries = await withAnon((tx) => publicIndustries(tx));
  const match = industries.find((i) => i.slug === slug);
  if (!match) return null;
  const scope = { industry: match.industry };
  const [byType, byMarket, comp, board] = await withAnon((tx) =>
    Promise.all([
      moveCountsByType(tx, scope),
      moveCountsBy(tx, 'market', scope),
      compCells(tx, scope),
      listingStats(tx, scope),
    ]),
  );
  return {
    kind: 'industry',
    key: slug,
    name: match.industry,
    path: `/data/industries/${slug}`,
    moves: {
      total: byType.appointed + byType.departed + byType.promoted,
      byType,
      breakdown: byMarket.map((r) => ({
        key: marketLabel[r.key as MarketCode] ?? r.key,
        n: r.n,
      })),
    },
    comp: { cells: comp.cells, suppressed: comp.suppressed },
    board,
    asOf: now.toISOString().slice(0, 10),
  };
}

export async function marketDataset(code: string, now = new Date()): Promise<Dataset | null> {
  const upper = code.toUpperCase() as MarketCode;
  if (!(upper in marketLabel)) return null;
  const scope = { market: upper };
  const [byType, byIndustry, comp, board] = await withAnon((tx) =>
    Promise.all([
      moveCountsByType(tx, scope),
      moveCountsBy(tx, 'industry', scope),
      compCells(tx, scope),
      listingStats(tx, scope),
    ]),
  );
  return {
    kind: 'market',
    key: upper.toLowerCase(),
    name: marketLabel[upper],
    path: `/data/markets/${upper.toLowerCase()}`,
    moves: {
      total: byType.appointed + byType.departed + byType.promoted,
      byType,
      breakdown: byIndustry,
    },
    comp: { cells: comp.cells, suppressed: comp.suppressed },
    board,
    asOf: now.toISOString().slice(0, 10),
  };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  // Quote when needed, and neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Long-format CSV: one row per figure, with the count behind it. */
export function datasetCsv(d: Dataset): string {
  const rows: (string | number)[][] = [['metric', 'group', 'value', 'n', 'currency', 'basis']];
  rows.push(['moves_total', d.name, d.moves.total, d.moves.total, '', '']);
  for (const [t, n] of Object.entries(d.moves.byType))
    rows.push([`moves_${t}`, d.name, n, n, '', '']);
  for (const b of d.moves.breakdown)
    rows.push([
      d.kind === 'industry' ? 'moves_by_market' : 'moves_by_industry',
      b.key,
      b.n,
      b.n,
      '',
      '',
    ]);
  for (const c of d.comp.cells) {
    const group = `${c.level} · ${c.market}`;
    rows.push(['comp_median_min', group, c.medianMin, c.n, c.currency, c.compBasis]);
    rows.push(['comp_median_max', group, c.medianMax, c.n, c.currency, c.compBasis]);
  }
  rows.push(['listings_live', d.name, d.board.live, d.board.live, '', '']);
  rows.push(['listings_with_comp', d.name, d.board.withComp, d.board.live, '', '']);
  return (
    rows.map((r) => r.map(csvCell).join(',')).join('\n') +
    `\n# ${brand.name} · ${d.name} · as of ${d.asOf} · comp cells under ${MIN_CELL} listings withheld (${d.comp.suppressed})\n`
  );
}

/** Plain-text citation for the "Cite this" block. */
export function citation(d: Dataset, origin: string): string {
  return `${brand.name}, “${d.name}: CMO moves and comp”, data as of ${d.asOf}. ${origin}${d.path}`;
}

/** schema.org Dataset for search and AI answers. */
export function datasetJsonLd(d: Dataset, origin: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${d.name}: CMO moves and comp`,
    description: `Editor-approved CMO moves and advertised comp for ${d.name}, from ${brand.name}. Aggregates only; groups under ${MIN_CELL} listings are withheld.`,
    url: `${origin}${d.path}`,
    creator: { '@type': 'Organization', name: brand.name, url: origin },
    dateModified: d.asOf,
    isAccessibleForFree: true,
    distribution: [
      {
        '@type': 'DataDownload',
        encodingFormat: 'text/csv',
        contentUrl: `${origin}${d.path}/data.csv`,
      },
    ],
  };
}
