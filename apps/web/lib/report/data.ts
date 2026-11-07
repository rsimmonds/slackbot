import 'server-only';
import { createHash } from 'node:crypto';
import { brand } from '@cmobeat/config';
import { withAnon } from '@cmobeat/db';
import {
  compCells,
  listingStats,
  moveCountsBy,
  moveCountsByType,
  MIN_CELL,
  type CompCell,
} from '@/lib/publication/aggregates';
import type { MoveType } from '@/lib/publication/labels';
import { sampleMedianTenure, sampleTenure } from '@/lib/publication/sample-tenure';

/** The current edition. One report per year; the version changes whenever the data does. */
export const REPORT_YEAR = 2026;
export const REPORT_SLUG = `state-of-the-cmo-seat-${REPORT_YEAR}`;
export const REPORT_TITLE = `${brand.annualReport} ${REPORT_YEAR}`;

export interface ReportData {
  year: number;
  asOf: string;
  /** Short content hash of everything below: the cache key for the generated PDF. */
  version: string;
  sample: boolean;
  moves: {
    total: number;
    byType: Record<MoveType, number>;
    byIndustry: { key: string; n: number }[];
    byMarket: { key: string; n: number }[];
  };
  comp: { cells: CompCell[]; suppressed: number; listings: number; minCell: number };
  board: { live: number; withComp: number; fractional: number; remote: number };
  tenure: { median: number; bins: readonly (readonly [number, number])[]; label: string };
}

/**
 * Everything the report says, computed as an anonymous visitor so it can only contain what the
 * public site already shows. Moves cover the report year; comp and the board are as of today.
 */
export async function reportData(now = new Date()): Promise<ReportData> {
  const scope = { year: REPORT_YEAR };
  const [byType, byIndustry, byMarket, comp, board] = await withAnon((tx) =>
    Promise.all([
      moveCountsByType(tx, scope),
      moveCountsBy(tx, 'industry', scope),
      moveCountsBy(tx, 'market', scope),
      compCells(tx),
      listingStats(tx),
    ]),
  );
  const body = {
    year: REPORT_YEAR,
    asOf: now.toISOString().slice(0, 10),
    sample: process.env.VERCEL_ENV !== 'production',
    moves: {
      total: byType.appointed + byType.departed + byType.promoted,
      byType,
      byIndustry,
      byMarket,
    },
    comp: { ...comp, minCell: MIN_CELL },
    board,
    tenure: { median: sampleMedianTenure, bins: sampleTenure.bins, label: sampleTenure.label },
  };
  const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
  return { ...body, version };
}
