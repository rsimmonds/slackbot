import type { Currency, Market } from '@cmobeat/config';
import { MandateDocumentSchema, type MandateDocument } from '../../schemas/mandate';
import {
  currencyForMarket,
  detectCurrency,
  detectLevel,
  detectMarket,
  detectReportingLine,
  firstClause,
  firstCount,
  isVague,
  marketForCurrency,
  parseComp,
  splitList,
  titleForLevel,
} from '../extract';
import type { FieldSpec, InterviewSpec } from '../types';

/**
 * Mandate Builder (spec 5.3.2, agent: claude-opus-5-5). A ~15-question session with the CEO or a
 * board member. Output: mandate document, 90-day scorecard, interview plan and intended comp.
 * The comp benchmark beside it is computed from listings data, never by the model.
 */
export type MandateDraft = Partial<MandateDocument>;
type Field = FieldSpec<MandateDraft>;
type ScoreItem = MandateDocument['scorecard'][number];
type PlanItem = MandateDocument['interviewPlan'][number];

const hasItems = (v: unknown, min = 1) => Array.isArray(v) && v.length >= min;
const capitalise = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Parse "outcome — measured by X" style lines into scorecard items. */
function scoreItems(answer: string, byDay: 30 | 90): ScoreItem[] {
  return splitList(answer, 6)
    .slice(0, 5)
    .map((line) => {
      const day: 30 | 60 | 90 =
        byDay === 90 && /\b(day\s*60|60 days|sixty)\b/i.test(line) ? 60 : byDay;
      const [outcome, measure] = line
        .split(/\s+(?:—|–|-|:)\s+|\s*,?\s*measured by\s+|\s*\(measure[:\s]+/i)
        .filter((p) => p.trim());
      return {
        outcome: firstClause(outcome ?? line, 140),
        measure: measure
          ? capitalise(firstClause(measure.replace(/\)$/, '').replace(/^measured by\s+/i, ''), 120))
          : `Agreed with the hiring executive at the day-${day} review`,
        byDay: day,
      };
    })
    .filter((i) => i.outcome.length >= 5);
}

/** Parse "CEO: vision and fit" style lines into interview stages. */
function planItems(answer: string): PlanItem[] {
  return splitList(answer, 4)
    .slice(0, 7)
    .map((line, i) => {
      const m = line.match(
        /^(.{2,60}?)\s*(?::|—|–|-|\bto test\b|\bon\b|\babout\b|\bfor\b)\s+(.+)$/i,
      );
      const interviewer = (m?.[1] ?? line).trim();
      const tests = (m?.[2] ?? 'Overall fit with the mandate')
        .split(/,|\band\b/)
        .map((t) => t.trim().replace(/\.$/, ''))
        .filter((t) => t.length >= 3);
      return {
        stage: `Stage ${i + 1}`,
        interviewer: firstClause(interviewer, 60),
        tests: tests.length
          ? tests.map((t) => firstClause(t, 80))
          : ['Overall fit with the mandate'],
      };
    });
}

const fields: Field[] = [
  {
    key: 'role',
    question:
      'Let us start with the seat itself. What is the title, and is it full-time or fractional?',
    followUp:
      'Which title are you hiring for — CMO, VP Marketing, Chief Growth Officer — and is it full-time?',
    extract: (a) => {
      const lvl = detectLevel(a);
      if (!lvl) return null;
      return {
        level: lvl.level,
        title: titleForLevel[lvl.level],
        workType: lvl.fractional || lvl.level === 'fractional_cmo' ? 'fractional' : 'full_time',
        compBasis: lvl.fractional || lvl.level === 'fractional_cmo' ? 'monthly_retainer' : 'annual',
      };
    },
    isComplete: (d) => !!d.level && !!d.title && !!d.workType,
  },
  {
    key: 'whyNow',
    question: 'Why are you hiring for this seat now? What changed?',
    followUp: 'Say a little more. What happened in the business that makes this the moment?',
    extract: (a) => {
      if (isVague(a, 8)) return null;
      const text = a.replace(/\s+/g, ' ').trim();
      return { summary: text.length > 600 ? `${text.slice(0, 599).trimEnd()}…` : text };
    },
    isComplete: (d) => (d.summary?.length ?? 0) >= 20,
  },
  {
    key: 'reportingLine',
    question: 'Who will this person report to, and who else sits at that table?',
    followUp:
      'To be precise: does the role report to the CEO, a founder, the board, or someone else?',
    extract: (a) => {
      const line = detectReportingLine(a);
      return line ? { reportingLine: line } : null;
    },
    isComplete: (d) => !!d.reportingLine,
  },
  {
    key: 'priorities',
    question: 'What has to be true in twelve months for this hire to have been the right one?',
    followUp: 'Name three outcomes, as concretely as you can. One per line is fine.',
    extract: (a) => {
      const items = splitList(a, 8).slice(0, 6);
      return items.length >= 3 ? { priorities: items } : null;
    },
    isComplete: (d) => hasItems(d.priorities, 3),
  },
  {
    key: 'scorecard30',
    question: 'What would you expect to see from them in the first 30 days?',
    followUp:
      'Two or three things you could check on day 30. How would you know each one happened?',
    extract: (a, d) => {
      const items = isVague(a, 5) ? [] : scoreItems(a, 30);
      if (!items.length) return null;
      return { scorecard: [...(d.scorecard ?? []).filter((s) => s.byDay !== 30), ...items] };
    },
    isComplete: (d) => !!d.scorecard?.some((s) => s.byDay === 30),
  },
  {
    key: 'scorecard90',
    question: 'And by day 90? What will have moved, and how will you measure it?',
    followUp:
      'Pick the two results that matter most by day 90, and the number you would look at for each.',
    extract: (a, d) => {
      const items = isVague(a, 5) ? [] : scoreItems(a, 90);
      if (!items.length) return null;
      return { scorecard: [...(d.scorecard ?? []).filter((s) => s.byDay === 30), ...items] };
    },
    isComplete: (d) => !!d.scorecard?.some((s) => s.byDay !== 30),
  },
  {
    key: 'tensions',
    question: 'Who will this person disagree with most often, and who should win that argument?',
    followUp:
      'Think of the hardest conversation they will have in the first six months. Who is it with, and about what?',
    extract: (a) => (isVague(a, 6) ? null : { tensions: splitList(a, 8).slice(0, 5) }),
    isComplete: (d) => d.tensions !== undefined,
  },
  {
    key: 'nonNegotiables',
    question: 'What must they have done before? Is there anything you will not compromise on?',
    followUp: 'List the experience you would screen on. Short phrases are fine.',
    extract: (a) => {
      if (/^\s*(nothing|none|no)\b/i.test(a)) return { nonNegotiables: [] };
      if (isVague(a, 4)) return null;
      return { nonNegotiables: splitList(a, 5).slice(0, 6) };
    },
    isComplete: (d) => d.nonNegotiables !== undefined,
  },
  {
    key: 'teamSize',
    question: 'How large is the team they inherit today?',
    followUp:
      'Roughly how many people will report into marketing on their first day? Zero is a fine answer.',
    extract: (a) => {
      const n = firstCount(a);
      return n === null ? null : { teamSize: n };
    },
    isComplete: (d) => d.teamSize !== undefined,
  },
  {
    key: 'location',
    question: 'Where is the role based, and which currency do you pay in?',
    followUp: 'Which country is the role in — the US, Canada, the UK, or elsewhere in Europe?',
    extract: (a) => {
      const currency = detectCurrency(a);
      const market = detectMarket(a) ?? (currency ? marketForCurrency[currency] : null);
      if (!market) return null;
      return { market, currency: currency ?? currencyForMarket[market] };
    },
    isComplete: (d) => !!d.market && !!d.currency,
  },
  {
    key: 'comp',
    question: 'What compensation range do you intend to offer? A base range is enough for now.',
    followUp:
      'A range helps candidates and keeps you compliant with pay-transparency rules. What are the low and high ends?',
    extract: (a, d) => {
      const c = parseComp(a);
      if (!c) return null;
      return {
        compMin: c.min,
        compMax: c.max,
        compBasis: d.workType === 'fractional' ? 'monthly_retainer' : c.basis,
        ...(c.currency ? { currency: c.currency } : {}),
      };
    },
    isComplete: (d) => typeof d.compMin === 'number' && typeof d.compMax === 'number',
  },
  {
    key: 'interviewPlan',
    question: 'Who should meet the finalists, and what should each conversation test?',
    followUp:
      'Name the people involved, one per line, with what each one is judging. For example: "CEO: vision and pace".',
    extract: (a) => {
      const items = planItems(a);
      return items.length >= 2 ? { interviewPlan: items } : null;
    },
    isComplete: (d) => hasItems(d.interviewPlan, 2),
  },
  {
    key: 'risks',
    question: 'Last one. What could make this hire fail, even with the right person in the seat?',
    followUp: 'Think about budget, timing, the team or the board. What worries you most?',
    extract: (a) => (isVague(a, 5) ? null : { risks: splitList(a, 6).slice(0, 6) }),
    isComplete: (d) => d.risks !== undefined,
  },
];

const DEFAULT_PLAN: PlanItem[] = [
  { stage: 'Stage 1', interviewer: 'CEO', tests: ['Mandate fit', 'Pace and judgement'] },
  {
    stage: 'Stage 2',
    interviewer: 'Executive peers',
    tests: ['Collaboration with sales and product'],
  },
  {
    stage: 'Stage 3',
    interviewer: 'Board member',
    tests: ['Strategic clarity', 'Board communication'],
  },
  { stage: 'Stage 4', interviewer: 'Final case review', tests: ['A 90-day plan for this mandate'] },
];

/** Which output fields finalize() supplies itself rather than reading from the answers. */
function derivedFields(d: MandateDraft): string[] {
  const out: string[] = [];
  if (!d.level) out.push('level', 'title', 'workType');
  if (!d.market) out.push('market');
  if (!d.currency) out.push('currency');
  if (!d.reportingLine) out.push('reportingLine');
  if ((d.summary?.length ?? 0) < 20) out.push('summary');
  if ((d.scorecard?.length ?? 0) < 3) out.push('scorecard');
  if ((d.interviewPlan?.length ?? 0) < 3) out.push('interviewPlan');
  return out;
}

function finalize(d: MandateDraft): MandateDocument {
  const level = d.level ?? 'cmo';
  const market: Market = d.market ?? (d.currency ? marketForCurrency[d.currency] : 'US');
  const currency: Currency = d.currency ?? currencyForMarket[market];
  const title = d.title ?? titleForLevel[level];
  const reportingLine = d.reportingLine ?? 'CEO';
  const priorities = d.priorities ?? [];
  // Scorecard: the employer's own answers first; then their priorities as day-90 outcomes.
  const scorecard: ScoreItem[] = [...(d.scorecard ?? [])];
  for (const p of priorities) {
    if (scorecard.length >= 3) break;
    scorecard.push({
      outcome: firstClause(p, 140),
      measure: 'Agreed with the hiring executive at the day-90 review',
      byDay: 90,
    });
  }
  const interviewPlan = [...(d.interviewPlan ?? [])];
  for (const stage of DEFAULT_PLAN) {
    if (interviewPlan.length >= 3) break;
    if (!interviewPlan.some((s) => s.interviewer.toLowerCase() === stage.interviewer.toLowerCase()))
      interviewPlan.push({ ...stage, stage: `Stage ${interviewPlan.length + 1}` });
  }
  const workType = d.workType ?? (level === 'fractional_cmo' ? 'fractional' : 'full_time');
  return {
    title,
    level,
    workType,
    market,
    currency,
    reportingLine,
    teamSize: d.teamSize ?? null,
    summary:
      (d.summary?.length ?? 0) >= 20
        ? d.summary!
        : `${title}, reporting to ${reportingLine}. Why now is still to be written.`,
    priorities,
    tensions: d.tensions ?? [],
    nonNegotiables: d.nonNegotiables ?? [],
    risks: d.risks ?? [],
    scorecard: scorecard.slice(0, 8),
    interviewPlan: interviewPlan.slice(0, 7),
    compMin: d.compMin ?? null,
    compMax: d.compMax ?? null,
    // Fractional seats are priced per month, full-time seats per year (also enforced in Postgres).
    compBasis: workType === 'fractional' ? 'monthly_retainer' : 'annual',
  };
}

export const mandateSpec: InterviewSpec<MandateDraft, MandateDocument> = {
  kind: 'mandate',
  agent: 'mandate-builder',
  refPrefix: 'MB',
  maxQuestions: 15,
  fields,
  schema: MandateDocumentSchema,
  finalize,
  derivedFields,
  intro: 'Reading your mandate. I will ask one question at a time.',
};
