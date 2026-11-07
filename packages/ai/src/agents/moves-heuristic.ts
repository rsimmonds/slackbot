import type { SourceItemPayload } from '../format';
import type { MoveClassification, MoveDraft } from '../schemas/move';

/**
 * Deterministic, offline Moves Tracker used when no model is configured. Conservative by design:
 * anything it cannot read cleanly is either "not relevant" or an incomplete draft that fails
 * validation and goes to the human queue.
 */

const SEAT =
  /(?:interim |fractional |global |group )?(?:chief marketing officer|chief growth officer|chief brand officer|chief marketing and \w+ officer|\bCMO\b|head of marketing)/i;
const RUMOUR =
  /\b(reportedly|rumou?r(?:ed|s)?|sources (?:say|said)|is said to|could be|may be leaving|in talks|speculat)/i;
const PROMOTED = /\bpromot(?:es|ed|ion)\b|\belevat(?:es|ed)\b/i;
const DEPARTED =
  /\b(steps? down|stepping down|step down|depart(?:s|ed|ure)|leaves|leaving|has left|retire(?:s|ment|d)?|resign(?:s|ed|ation)|exit(?:s|ed)?|notified the company)\b/i;
const APPOINTED =
  /\b(appoint(?:s|ed|ment)?|names?|named|hires?|hired|welcomes?|joins?|has joined|to lead marketing)\b/i;
const BELOW_SEAT = /\b(VP|SVP|EVP|Vice President|Director|Manager)\b/;
const NAME = "[A-Z][a-zA-Z'’-]+(?:\\s+(?:[A-Z]\\.|[A-Z][a-zA-Z'’-]+)){1,2}";

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

export function seatTitle(text: string): string | null {
  const m = text.match(SEAT);
  if (!m) return null;
  const t = m[0].trim();
  return t.toUpperCase() === 'CMO'
    ? 'Chief Marketing Officer'
    : t
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .replace(/\bAnd\b/, 'and')
        .replace(/\bOf\b/, 'of');
}

export function moveTypeOf(text: string): MoveClassification['moveType'] {
  if (PROMOTED.test(text)) return 'promoted';
  if (DEPARTED.test(text)) return 'departed';
  if (APPOINTED.test(text)) return 'appointed';
  return null;
}

function tipFields(text: string) {
  const field = (k: string) =>
    text.match(new RegExp(`${k}:\\s*([^\\n;]+)`, 'i'))?.[1]?.trim() ?? null;
  return {
    person: field('Person'),
    company: field('Company'),
    role: field('Role'),
    move: field('Move'),
  };
}

/** Words that start a role, not a name ("Callum Reyes Interim Chief..."). */
const ROLE_WORDS = new Set([
  'Interim',
  'Fractional',
  'Chief',
  'Global',
  'Group',
  'As',
  'To',
  'VP',
  'SVP',
  'EVP',
  'Head',
  'CMO',
  'President',
]);
function cleanName(raw: string): string | null {
  const words: string[] = [];
  for (const w of raw.trim().split(/\s+/)) {
    if (ROLE_WORDS.has(w)) break;
    words.push(w);
  }
  return words.length >= 2 ? words.join(' ') : null;
}

export function personOf(item: SourceItemPayload): string | null {
  if (item.kind === 'submission') return tipFields(item.text).person;
  const body = `${item.title}. ${item.text}`;
  const patterns = [
    new RegExp(
      `(?:[Aa]ppoints|[Nn]ames|[Hh]ires|[Ww]elcomes|[Pp]romotes|[Aa]nnounces(?: the appointment of)?)\\s+(${NAME})`,
    ),
    new RegExp(`(${NAME})\\s+(?:has been|was|is|will be)\\s+(?:appointed|named|promoted)`),
    new RegExp(
      `(${NAME})\\s+(?:joins|to join|has joined|steps down|to step down|will step down|is leaving|has left|to retire|will retire|resigns|has resigned)`,
    ),
    new RegExp(`(${NAME}),\\s+(?:the Company's|our|its)\\s+${SEAT.source}`, 'i'),
  ];
  for (const p of patterns) {
    const m = body.match(p);
    const name = m?.[1] ? cleanName(m[1]) : null;
    if (name && !/^(The|Our|Its|Company|Inc)\b/.test(name)) return name;
  }
  return null;
}

export function companyOf(item: SourceItemPayload): string | null {
  if (item.kind === 'submission') return tipFields(item.text).company;
  if (item.kind === 'edgar') return item.title.split(':')[0]!.trim();
  const m = item.title.match(
    /^([A-Z][\w&.,'’ -]+?)\s+(?:Appoints|Names|Announces|Promotes|Welcomes|Hires|Adds)\b/,
  );
  if (m?.[1]) return m[1].trim();
  return item.publisher;
}

export function effectiveDateOf(text: string): string | null {
  const iso = text.match(/effective\s+(?:as of\s+)?(\d{4}-\d{2}-\d{2})/i);
  if (iso) return iso[1]!;
  const m = text.match(
    /effective\s+(?:as of\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i,
  );
  if (m) {
    const month = String(MONTHS.indexOf(m[1]!.toLowerCase()) + 1).padStart(2, '0');
    return `${m[3]}-${month}-${m[2]!.padStart(2, '0')}`;
  }
  // European order: "joins on 1 January 2027", "effective 14 November 2026".
  const eu = text.match(
    /(?:effective|joins?\s+on|starts?\s+on|starting)\s+(?:as of\s+)?(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
  );
  if (!eu) return null;
  const month = String(MONTHS.indexOf(eu[2]!.toLowerCase()) + 1).padStart(2, '0');
  return `${eu[3]}-${month}-${eu[1]!.padStart(2, '0')}`;
}

export function heuristicClassify(item: SourceItemPayload): MoveClassification {
  const text = `${item.title}. ${item.text}`;
  if (item.kind === 'submission') {
    const f = tipFields(item.text);
    const type =
      (['appointed', 'departed', 'promoted'] as const).find((t) => t === f.move?.toLowerCase()) ??
      null;
    const relevant = !!(f.person && f.company && f.role && SEAT.test(f.role) && type);
    return {
      relevant,
      moveType: relevant ? type : null,
      confidence: relevant ? 0.4 : 0.2,
      reason: relevant
        ? 'Reader tip naming a CMO-level move.'
        : 'Reader tip is incomplete or not about the CMO seat.',
    };
  }
  if (RUMOUR.test(text))
    return {
      relevant: false,
      moveType: null,
      confidence: 0.7,
      reason: 'Speculation, not a confirmed move.',
    };
  if (!SEAT.test(text))
    return {
      relevant: false,
      moveType: null,
      confidence: 0.8,
      reason: 'No CMO-level role mentioned.',
    };
  // A VP or director hire that only mentions the CMO (e.g. "reporting to the CMO") is not a seat move.
  if (BELOW_SEAT.test(item.title) && !SEAT.test(item.title)) {
    return {
      relevant: false,
      moveType: null,
      confidence: 0.7,
      reason: 'A role below the CMO seat.',
    };
  }
  const type = moveTypeOf(text);
  const person = personOf(item);
  if (!type || !person)
    return {
      relevant: false,
      moveType: null,
      confidence: 0.5,
      reason: 'Mentions the role but names no person or move.',
    };
  return {
    relevant: true,
    moveType: type,
    confidence: 0.6,
    reason: `Names ${person} in a CMO-level ${type} move.`,
  };
}

export function heuristicDraft(item: SourceItemPayload): MoveDraft {
  const text = `${item.title}. ${item.text}`;
  const tip = item.kind === 'submission' ? tipFields(item.text) : null;
  const personName = personOf(item) ?? '';
  const companyName = companyOf(item) ?? '';
  const moveType =
    (tip?.move?.toLowerCase() as MoveDraft['moveType']) ?? moveTypeOf(text) ?? 'appointed';
  const title = tip?.role ?? seatTitle(text) ?? '';
  const verb = {
    appointed: 'has been appointed',
    departed: 'is leaving the role of',
    promoted: 'has been promoted to',
  }[moveType];
  const date = item.publishedAt ? item.publishedAt.slice(0, 10) : 'undated';
  return {
    personName,
    companyName,
    moveType,
    title,
    previousRole: null,
    effectiveDate: effectiveDateOf(text),
    summary:
      item.kind === 'submission'
        ? `Reader tip, not yet verified: ${personName} ${verb} ${title} at ${companyName}. An editor must confirm the source before publishing.`
        : `${personName} ${verb} ${title} at ${companyName}, according to ${item.publisher ?? 'the source'}.`,
    sources: [
      {
        url: item.url,
        label: `${item.publisher ?? new URL(item.url).hostname}, ${date}`,
        kind: item.kind,
      },
    ],
    confidence: item.kind === 'submission' ? 0.4 : 0.6,
  };
}
