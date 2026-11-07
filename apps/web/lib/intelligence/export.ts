import 'server-only';
import { brand } from '@cmobeat/config';
import { audit, withUser } from '@cmobeat/db';
import { z } from 'zod';
import type { Viewer } from '@/lib/auth';
import { apiAccess, KeyError } from '@/lib/api-keys/keys';
import { compAggregates, listMoves, type ApiMove, type CompCell } from './data';
import { compFiltersSchema, licence, moveFiltersSchema } from './filters';

/*
 * Intelligence exports for subscribers: the moves dataset and comp aggregates as CSV or JSON.
 * The same public read model as the API (withAnon underneath), streamed page by page.
 */

export const exportInput = z.object({
  dataset: z.enum(['moves', 'comp']),
  format: z.enum(['csv', 'json']).default('csv'),
});

/** RFC 4180 field: quote when needed, double inner quotes; neutralise spreadsheet formulas. */
export function csvField(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // CSV injection: a leading = + - @ (or tab/CR) would run as a formula in spreadsheets.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvRow = (values: unknown[]) => `${values.map(csvField).join(',')}\r\n`;

const moveHeader = [
  'id',
  'person',
  'company',
  'industry',
  'market',
  'type',
  'title',
  'previous_role',
  'effective_date',
  'source_urls',
  'url',
];
const moveCsv = (m: ApiMove) => [
  m.id,
  m.person,
  m.company.name,
  m.company.industry,
  m.company.market,
  m.type,
  m.title,
  m.previousRole,
  m.effectiveDate,
  m.sources.map((s) => s.url).join(' '),
  m.url,
];
const compHeader = [
  'level',
  'market',
  'currency',
  'basis',
  'n',
  'suppressed',
  'p25',
  'median',
  'p75',
];
const compCsv = (c: CompCell) => [
  c.level,
  c.market,
  c.currency,
  c.basis,
  c.n,
  c.suppressed,
  c.p25,
  c.median,
  c.p75,
];

export function provenance(dataset: string, filters: Record<string, unknown>, at: Date) {
  const f = Object.entries(filters)
    .filter(([k, v]) => v !== undefined && k !== 'limit' && k !== 'cursor')
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('; ');
  return `${brand.name} ${dataset} dataset · generated ${at.toISOString()} · filters: ${f || 'none'} · ${licence}`;
}

/** Check access, write the audit entry, and return a streaming response body. */
export async function exportDataset(
  viewer: Viewer | null,
  params: Record<string, string>,
  now = new Date(),
): Promise<{ body: ReadableStream<Uint8Array>; filename: string; contentType: string }> {
  if (!viewer) throw new KeyError('Sign in as an employer.', 401);
  const access = await apiAccess(viewer);
  if (!access) throw new KeyError('Exports are for employers.', 403);
  if (!access.subscribed) throw new KeyError('Exports are part of the employer subscription.', 403);
  const { dataset, format } = exportInput.parse(params);
  const filters =
    dataset === 'moves'
      ? moveFiltersSchema.parse({ ...params, limit: 200, cursor: undefined })
      : compFiltersSchema.parse(params);

  await withUser({ userId: viewer.id, roles: viewer.roles }, (tx) =>
    audit(tx, {
      actorId: viewer.id,
      action: 'intelligence.export',
      targetType: 'company',
      targetId: access.companyId,
      metadata: { dataset, format, filters },
    }),
  );

  const header = provenance(dataset, filters, now);
  const enc = new TextEncoder();
  const stamp = now.toISOString().slice(0, 10);
  const filename = `cmobeat-${dataset}-${stamp}.${format}`;
  const contentType =
    format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8';

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (dataset === 'comp') {
          const cells = await compAggregates(filters);
          if (format === 'csv') {
            controller.enqueue(enc.encode(`# ${header}\r\n${csvRow(compHeader)}`));
            for (const c of cells) controller.enqueue(enc.encode(csvRow(compCsv(c))));
          } else {
            controller.enqueue(enc.encode(JSON.stringify({ provenance: header, data: cells })));
          }
        } else {
          const q = filters as ReturnType<typeof moveFiltersSchema.parse>;
          controller.enqueue(
            enc.encode(
              format === 'csv'
                ? `# ${header}\r\n${csvRow(moveHeader)}`
                : `{"provenance":${JSON.stringify(header)},"data":[`,
            ),
          );
          let cursor: string | undefined;
          let first = true;
          do {
            const page = await listMoves({ ...q, cursor });
            for (const m of page.data) {
              controller.enqueue(
                enc.encode(
                  format === 'csv' ? csvRow(moveCsv(m)) : `${first ? '' : ','}${JSON.stringify(m)}`,
                ),
              );
              first = false;
            }
            cursor = page.nextCursor ?? undefined;
          } while (cursor);
          if (format === 'json') controller.enqueue(enc.encode(']}'));
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
  return { body, filename, contentType };
}
