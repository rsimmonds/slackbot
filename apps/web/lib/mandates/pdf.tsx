import 'server-only';
import { join } from 'node:path';
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { brand } from '@cmobeat/config';
import type { CompBenchmark } from './benchmark';
import type { MandateRecord } from './document';
import { compRange, levelLabel, marketLabel, money, workTypeLabel } from './labels';

/**
 * Mandate PDF in the Lab (light) theme: Instrument Serif headings, Geist body, hairline rules,
 * tabular numbers. Fonts come from the self-hosted @fontsource packages (no network at render).
 */
// Resolved at runtime from the app's node_modules (the bundler cannot follow computed paths).
// next.config.ts traces these files into the deployment (outputFileTracingIncludes).
const font = (pkg: string, file: string) => join(process.cwd(), 'node_modules', pkg, 'files', file);

let registered = false;
export function registerFonts() {
  if (registered) return;
  Font.register({
    family: 'Instrument Serif',
    src: font('@fontsource/instrument-serif', 'instrument-serif-latin-400-normal.woff'),
  });
  Font.register({
    family: 'Geist',
    fonts: [
      { src: font('@fontsource/geist', 'geist-latin-400-normal.woff'), fontWeight: 400 },
      { src: font('@fontsource/geist', 'geist-latin-500-normal.woff'), fontWeight: 500 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
  registered = true;
}

// Lab tokens (packages/ui/src/styles/tokens.css).
const c = {
  text: '#0B0D10',
  text2: '#5A6068',
  text3: '#6B6F74',
  line: '#E6E7E9',
  filament: '#A35E10',
};

const s = StyleSheet.create({
  page: {
    padding: 56,
    paddingBottom: 72,
    fontFamily: 'Geist',
    fontSize: 10,
    // No page-level lineHeight: react-pdf drops fixed, absolutely positioned footers on pages that
    // set it. Line height lives on the text styles instead.
    color: c.text,
  },
  label: { fontSize: 7.5, letterSpacing: 1.2, textTransform: 'uppercase', color: c.text3 },
  h1: { fontFamily: 'Instrument Serif', fontSize: 30, lineHeight: 1.1, marginTop: 8 },
  lede: { fontSize: 10.5, lineHeight: 1.5, color: c.text2, marginTop: 6 },
  h2: { fontFamily: 'Instrument Serif', fontSize: 17, marginBottom: 8 },
  section: { marginTop: 22, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: c.line },
  row: { flexDirection: 'row', gap: 16 },
  cell: { flex: 1 },
  item: { flexDirection: 'row', marginBottom: 4 },
  dash: { width: 12, color: c.text3 },
  body: { color: c.text2, lineHeight: 1.5 },
  num: { fontSize: 13 },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: c.line,
  },
  footerLeft: { position: 'absolute', left: 56, bottom: 32, fontSize: 7.5, color: c.text3 },
  footerRight: { position: 'absolute', right: 56, bottom: 32, fontSize: 7.5, color: c.text3 },
  seal: { color: c.filament },
});

function List({ items }: { items: string[] }) {
  if (!items.length) return <Text style={s.body}>—</Text>;
  return (
    <View>
      {items.map((t, i) => (
        <View key={i} style={s.item} wrap={false}>
          <Text style={s.dash}>—</Text>
          <Text style={{ flex: 1 }}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function BenchmarkBlock({ b }: { b: CompBenchmark | null }) {
  if (!b) return null;
  const per = b.basis === 'monthly_retainer' ? ' / mo' : '';
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={s.label}>Benchmark · computed from listings, not AI</Text>
      {b.enough ? (
        <View style={[s.row, { marginTop: 6 }]}>
          {(['p25', 'median', 'p75'] as const).map((k) => (
            <View key={k} style={s.cell}>
              <Text style={s.label}>
                {k === 'median' ? 'Median' : k === 'p25' ? '25th percentile' : '75th percentile'}
              </Text>
              <Text style={s.num}>
                {money(b[k]!, b.currency)}
                {per}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[s.body, { marginTop: 4 }]}>
          Not enough data yet ({b.n} comparable listings; at least 5 needed).
        </Text>
      )}
      <Text style={[s.body, { fontSize: 7.5, marginTop: 6 }]}>
        {b.method} {b.n} listings, as of {b.asOf}.{b.sample ? ' Includes sample data.' : ''}
      </Text>
    </View>
  );
}

export function MandatePdf({ m, confirmedBy }: { m: MandateRecord; confirmedBy?: string | null }) {
  const { doc } = m;
  const comp = compRange(doc.compMin, doc.compMax, doc.currency, doc.compBasis);
  return (
    <Document
      title={`${doc.title} — mandate`}
      author={brand.name}
      creator={brand.name}
      producer={brand.name}
    >
      <Page size="A4" style={s.page}>
        <Text style={s.label}>
          Mandate · {m.companyName} · {m.narrative.sessionRef ?? 'from listing'}
        </Text>
        <Text style={s.h1}>{doc.title}</Text>
        <Text style={s.lede}>
          {levelLabel[doc.level]} · {workTypeLabel[doc.workType]} · reports to{' '}
          {doc.reportingLine || '—'} · {marketLabel[doc.market]}
          {doc.teamSize !== null ? ` · team of ${doc.teamSize}` : ''}
        </Text>
        <Text style={[s.label, { marginTop: 10 }, m.confirmedAt ? s.seal : {}]}>
          {m.confirmedAt
            ? `Confirmed${confirmedBy ? ` by ${confirmedBy}` : ''} · ${m.confirmedAt.toISOString().slice(0, 10)}`
            : 'Draft · not yet confirmed by the employer'}
        </Text>

        <View style={s.section}>
          <Text style={s.h2}>Why now</Text>
          <Text>{doc.summary}</Text>
        </View>

        <View style={s.section}>
          <Text style={s.h2}>What must be true in twelve months</Text>
          <List items={doc.priorities} />
        </View>

        <View style={[s.section, s.row]}>
          <View style={s.cell}>
            <Text style={s.label}>Tensions</Text>
            <List items={doc.tensions} />
          </View>
          <View style={s.cell}>
            <Text style={s.label}>Non-negotiables</Text>
            <List items={doc.nonNegotiables} />
          </View>
          <View style={s.cell}>
            <Text style={s.label}>Risks</Text>
            <List items={doc.risks} />
          </View>
        </View>

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>90-day scorecard</Text>
          {doc.scorecard.map((r, i) => (
            <View key={i} style={s.tableRow}>
              <Text style={{ width: 48, color: c.text3 }}>Day {r.byDay}</Text>
              <Text style={{ flex: 3 }}>{r.outcome}</Text>
              <Text style={{ flex: 2, color: c.text2 }}>{r.measure}</Text>
            </View>
          ))}
        </View>

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>Compensation</Text>
          <Text style={s.num}>{comp ?? 'Range not set'}</Text>
          <BenchmarkBlock b={m.benchmark} />
        </View>

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>Interview plan</Text>
          {doc.interviewPlan.map((r, i) => (
            <View key={i} style={s.tableRow}>
              <Text style={{ width: 64, color: c.text3 }}>{r.stage}</Text>
              <Text style={{ flex: 1 }}>{r.interviewer}</Text>
              <Text style={{ flex: 2, color: c.text2 }}>{r.tests.join(' · ')}</Text>
            </View>
          ))}
        </View>

        <Text style={s.footerLeft} fixed>
          {`Confidential — prepared with ${brand.name}`}
        </Text>
        <Text
          style={s.footerRight}
          fixed
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

export async function renderMandatePdf(
  m: MandateRecord,
  confirmedBy?: string | null,
): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<MandatePdf m={m} confirmedBy={confirmedBy} />);
}
