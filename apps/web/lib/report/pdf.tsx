import 'server-only';
import { brand, type Currency } from '@cmobeat/config';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { registerFonts } from '@/lib/mandates/pdf';
import { pct } from '@/lib/publication/aggregates';
import { levelLabel, marketLabel, moveTypeLabel } from '@/lib/publication/labels';
import { REPORT_TITLE, type ReportData } from './data';

/**
 * The annual report as a PDF, in the Lab (light) theme: Instrument Serif headings, Geist body,
 * hairline rules, one neutral ink for every bar (single series per chart, so no legend and no
 * categorical colour). Every chart is also given as numbers beside it.
 */
const c = {
  text: '#0B0D10',
  text2: '#5A6068',
  text3: '#6B6F74',
  line: '#E6E7E9',
  bar: '#5A6068',
  barTrack: '#F4F5F6',
  filament: '#A35E10',
};

const s = StyleSheet.create({
  page: {
    padding: 56,
    paddingBottom: 72,
    fontFamily: 'Geist',
    fontSize: 10,
    color: c.text,
  },
  cover: { padding: 56, fontFamily: 'Geist', color: c.text, justifyContent: 'space-between' },
  label: { fontSize: 7.5, letterSpacing: 1.2, textTransform: 'uppercase', color: c.text3 },
  display: { fontFamily: 'Instrument Serif', fontSize: 44, lineHeight: 1.05, marginTop: 12 },
  h1: { fontFamily: 'Instrument Serif', fontSize: 26, lineHeight: 1.1, marginTop: 6 },
  h2: { fontFamily: 'Instrument Serif', fontSize: 16, marginBottom: 8 },
  lede: { fontSize: 11, lineHeight: 1.5, color: c.text2, marginTop: 10 },
  body: { color: c.text2, lineHeight: 1.5 },
  section: { marginTop: 20, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: c.line },
  stats: { flexDirection: 'row', gap: 16, marginTop: 18 },
  stat: { flex: 1, borderTopWidth: 0.5, borderTopColor: c.line, paddingTop: 8 },
  statValue: { fontSize: 24, marginTop: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  barLabel: { width: 130, fontSize: 9, color: c.text2 },
  barTrack: { flex: 1, height: 7, backgroundColor: c.barTrack, borderRadius: 2 },
  barValue: { width: 36, textAlign: 'right', fontSize: 9 },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: c.line,
  },
  th: { fontSize: 7.5, letterSpacing: 1, textTransform: 'uppercase', color: c.text3 },
  note: { fontSize: 8, lineHeight: 1.4, color: c.text3, marginTop: 6 },
  sample: { fontSize: 8, color: c.filament, marginTop: 6 },
  // No page-level lineHeight: react-pdf drops an absolute fixed footer on a page that sets one.
  footer: { position: 'absolute', left: 56, right: 56, bottom: 28 },
  footerText: { fontSize: 7.5, color: c.text3 },
  footerSample: { fontSize: 7.5, color: c.filament, marginBottom: 4 },
});

const money = (currency: Currency) => {
  const f = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 0,
  });
  return (n: number) => f.format(n);
};

function Bars({ rows, unit }: { rows: { label: string; n: number }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return <Text style={s.body}>No data yet.</Text>;
  return (
    <View>
      {rows.map((r) => (
        <View key={r.label} style={s.barRow} wrap={false}>
          <Text style={s.barLabel}>{r.label}</Text>
          <View style={s.barTrack}>
            <View
              style={{
                width: `${Math.max(2, (r.n / max) * 100)}%`,
                height: 7,
                backgroundColor: c.bar,
                borderRadius: 2,
              }}
            />
          </View>
          <Text style={s.barValue}>{r.n}</Text>
        </View>
      ))}
      <Text style={s.note}>{`Counts of ${unit}.`}</Text>
    </View>
  );
}

/** The largest groups, with the rest folded into one "Other" row (never more bars than fit). */
function topWithOther(rows: { key: string; n: number }[], keep: number, otherLabel: string) {
  const head = rows.slice(0, keep).map((r) => ({ label: r.key, n: r.n }));
  const rest = rows.slice(keep).reduce((sum, r) => sum + r.n, 0);
  return rest ? [...head, { label: otherLabel, n: rest }] : head;
}

function Footer({ sample }: { sample: boolean }) {
  // A fixed View (not a fragment): render-prop text inside a fragment is dropped by react-pdf.
  return (
    <View fixed style={s.footer}>
      {sample ? (
        <Text style={s.footerSample}>Sample data — all companies and people are fictional.</Text>
      ) : null}
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) =>
          `${REPORT_TITLE} · ${brand.name} · ${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

function SampleLine({ d }: { d: ReportData }) {
  return d.sample ? (
    <Text style={s.sample}>Sample data — all companies and people are fictional.</Text>
  ) : null;
}

export function ReportPdf({ d }: { d: ReportData }) {
  const b = d.moves.byType;
  const cells = [...d.comp.cells].sort(
    (x, y) =>
      x.currency.localeCompare(y.currency) ||
      x.compBasis.localeCompare(y.compBasis) ||
      x.level.localeCompare(y.level),
  );
  return (
    <Document title={REPORT_TITLE} author={brand.name} subject="Annual report on the CMO seat">
      <Page size="A4" style={s.cover}>
        <View>
          <Text style={s.label}>{`${brand.name} · Annual report`}</Text>
          <Text style={s.display}>{REPORT_TITLE}</Text>
          <Text style={s.lede}>
            Who took the seat, who left it, and what the role pays: a year of CMO moves and
            advertised comp, reviewed by editors.
          </Text>
        </View>
        <View>
          <Text style={s.label}>{`Data as of ${d.asOf} · version ${d.version}`}</Text>
          <SampleLine d={d} />
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.label}>Summary</Text>
        <Text style={s.h1}>The year in the seat.</Text>
        <Text style={s.lede}>
          {`${d.moves.total} editor-approved moves in ${d.year}: ${b.appointed} appointments, ${b.departed} departures and ${b.promoted} promotions. ${d.board.live} senior roles are live on the board, and ${pct(d.board.withComp, d.board.live)}% of them state their comp.`}
        </Text>
        <View style={s.stats}>
          <View style={s.stat}>
            <Text style={s.label}>Moves tracked</Text>
            <Text style={s.statValue}>{String(d.moves.total)}</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.label}>Listings with comp</Text>
            <Text style={s.statValue}>{`${pct(d.board.withComp, d.board.live)}%`}</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.label}>Median tenure (illustrative)</Text>
            <Text style={s.statValue}>{`${d.tenure.median.toFixed(1)} yrs`}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Moves by type</Text>
          <Bars
            unit="editor-approved moves"
            rows={(['appointed', 'departed', 'promoted'] as const).map((t) => ({
              label: moveTypeLabel[t],
              n: b[t],
            }))}
          />
        </View>
        <View style={s.section}>
          <Text style={s.h2}>Moves by industry</Text>
          <Bars
            unit="editor-approved moves"
            rows={topWithOther(d.moves.byIndustry, 8, 'Other industries')}
          />
        </View>
        <View style={s.section} wrap={false}>
          <Text style={s.h2}>Moves by market</Text>
          <Bars
            unit="editor-approved moves"
            rows={d.moves.byMarket.map((r) => ({
              label: marketLabel[r.key as keyof typeof marketLabel] ?? r.key,
              n: r.n,
            }))}
          />
        </View>
        <Footer sample={d.sample} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.label}>Comp</Text>
        <Text style={s.h1}>What the seat pays.</Text>
        <Text style={s.lede}>
          Median advertised ranges from live listings, by level, market, currency and pay basis.
          Currencies are never converted or mixed. Fractional roles are monthly retainers.
        </Text>
        <View style={[s.section, { marginTop: 14 }]}>
          <View style={s.tableRow}>
            <Text style={[s.th, { flex: 2 }]}>Level</Text>
            <Text style={[s.th, { flex: 1.4 }]}>Market</Text>
            <Text style={[s.th, { flex: 1.6 }]}>Basis</Text>
            <Text style={[s.th, { flex: 2, textAlign: 'right' }]}>Median range</Text>
            <Text style={[s.th, { flex: 0.8, textAlign: 'right' }]}>Listings</Text>
          </View>
          {cells.map((cell) => {
            const fmt = money(cell.currency);
            return (
              <View
                key={`${cell.level}-${cell.market}-${cell.currency}-${cell.compBasis}`}
                style={s.tableRow}
                wrap={false}
              >
                <Text style={{ flex: 2 }}>{levelLabel[cell.level]}</Text>
                <Text style={{ flex: 1.4, color: c.text2 }}>{marketLabel[cell.market]}</Text>
                <Text style={{ flex: 1.6, color: c.text2 }}>
                  {cell.compBasis === 'monthly_retainer' ? 'Monthly retainer' : 'Annual base'}
                </Text>
                <Text style={{ flex: 2, textAlign: 'right' }}>
                  {`${fmt(cell.medianMin)}–${fmt(cell.medianMax)}`}
                </Text>
                <Text style={{ flex: 0.8, textAlign: 'right' }}>{String(cell.n)}</Text>
              </View>
            );
          })}
          {cells.length === 0 ? (
            <Text style={[s.body, { marginTop: 8 }]}>
              Not enough listings yet to publish any comp range.
            </Text>
          ) : null}
          <Text style={s.note}>
            {`Only combinations with at least ${d.comp.minCell} listings are shown. ${d.comp.suppressed} smaller combinations were withheld so no single listing can be read back. Based on ${d.comp.listings} live listings.`}
          </Text>
        </View>

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>The board</Text>
          <Text style={s.body}>
            {`${d.board.live} live senior roles. ${pct(d.board.withComp, d.board.live)}% state comp (it is required to publish), ${pct(d.board.fractional, d.board.live)}% are fractional, and ${pct(d.board.remote, d.board.live)}% are open to remote.`}
          </Text>
        </View>

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>Tenure (illustrative)</Text>
          <Text style={s.body}>
            {`Not measured: ${d.tenure.label}. Median ${d.tenure.median.toFixed(1)} years. Tenure needs both ends of a seat, and the archive does not hold enough of them yet.`}
          </Text>
          <View style={{ marginTop: 8 }}>
            <Bars
              unit="fictional seats per half-year of tenure (illustrative)"
              rows={d.tenure.bins.map(([lo, n]) => ({ label: `${lo}–${lo + 0.5} yrs`, n }))}
            />
          </View>
        </View>
        <Footer sample={d.sample} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.label}>Method and limitations</Text>
        <Text style={s.h1}>How these numbers were made.</Text>
        {[
          [
            'Moves',
            'Appointments, departures and promotions come from public sources (company newsrooms, press wires, SEC filings and reader tips with a public source). An AI drafts each move with its sources; an editor checks and approves it before it counts. Moves are dated by their effective date.',
          ],
          [
            'Comp',
            'Comp comes from live listings on the board, where a range is required to publish. Figures are advertised ranges, not offers or outcomes. We report medians of the advertised minimum and maximum, never mix currencies, and withhold any combination with fewer than five listings.',
          ],
          [
            'Tenure',
            'The tenure figures are an illustrative sample, labelled as such, until the archive holds enough completed seats to measure tenure directly.',
          ],
          [
            'Limitations',
            'Coverage depends on what companies announce publicly; private and smaller companies are under-represented. Listings reflect employers who chose this board. Treat small counts with care.',
          ],
          [
            'Citing',
            `Cite as: ${brand.name}, “${REPORT_TITLE}”, data as of ${d.asOf}. Public aggregates and CSVs are at ${brand.domain}/data.`,
          ],
        ].map(([h, t]) => (
          <View key={h} style={s.section} wrap={false}>
            <Text style={s.h2}>{h}</Text>
            <Text style={s.body}>{t}</Text>
          </View>
        ))}
        <Footer sample={d.sample} />
      </Page>
    </Document>
  );
}

/**
 * Generated on demand and kept in memory per data version: if the data is unchanged the same
 * bytes are served; when an editor approves a move the version changes and the next request
 * regenerates. Per-instance cache (fine for a report generated in well under a second); no
 * storage needed, and nothing personal is ever in the PDF.
 */
const cache = new Map<string, Buffer>();

export async function renderReportPdf(d: ReportData): Promise<Buffer> {
  const hit = cache.get(d.version);
  if (hit) return hit;
  registerFonts();
  const pdf = await renderToBuffer(<ReportPdf d={d} />);
  cache.clear();
  cache.set(d.version, pdf);
  return pdf;
}
