/**
 * Scrubbers for candidate text (spec 7.1.4, 9.9). Applied to every interview answer and to text
 * extracted from uploaded résumés before anything is stored or sent to a model.
 *
 * They work sentence by sentence and err on the side of removing: a dropped sentence costs the
 * candidate a detail they can add back; a kept one could leak a protected attribute into matching.
 */

/** Sentences that disclose a protected attribute. Matching is case-insensitive. */
const PROTECTED: { attribute: string; pattern: RegExp }[] = [
  {
    attribute: 'age',
    pattern:
      /\b(\d{2}\s*(years?|yrs?)[\s-]*old|aged?\s+\d{2}\b|i'?m\s+(in my\s+)?(\d{2}|twenties|thirties|forties|fifties|sixties)\b|born\s+(in\s+)?(19|20)\d{2}|my age|date of birth|\bdob\b|over\s+(40|50|60)\b|retire(ment)? age)/i,
  },
  {
    attribute: 'gender or pronouns',
    pattern:
      /\b(pronouns?|she\/her|he\/him|they\/them|as an? (woman|man|female|male|non-?binary)|i am an? (woman|man|female|male)|i'?m an? (woman|man|female|male|mother|father|mom|dad)|gender|transgender)\b/i,
  },
  {
    attribute: 'nationality or immigration status',
    pattern:
      /\b(nationality|citizenship|citizen of|i'?m (american|canadian|british|french|german|indian|chinese|irish|dutch|swedish|spanish|italian|mexican|brazilian)\b|visa (status|sponsorship)|green card|work permit|immigrant|passport)/i,
  },
  {
    attribute: 'ethnicity or race',
    pattern:
      /\b(ethnicity|ethnic|my race|racial|black woman|black man|white woman|white man|asian woman|asian man|latina|latino|latinx|hispanic)\b/i,
  },
  {
    attribute: 'religion',
    pattern:
      /\b(religion|religious|christian|muslim|jewish|hindu|buddhist|sikh|catholic|church|mosque|synagogue|temple)\b/i,
  },
  {
    attribute: 'disability or health',
    pattern:
      /\b(disab(led|ility)|chronic illness|diagnos(ed|is)|wheelchair|neurodivergent|adhd|autis(m|tic)|dyslexi[ac]|cancer|pregnan(t|cy)|medical leave|mental health)\b/i,
  },
  {
    attribute: 'family status',
    pattern:
      /\b(married|divorced|widow(ed|er)?|my (wife|husband|partner|spouse|kids|children|son|daughter)|(mother|father|mom|dad|parent) of|maternity|paternity|parental leave|childcare|single (mom|mother|dad|father))\b/i,
  },
  {
    attribute: 'graduation year',
    pattern:
      /\b(graduated (in |from \S+ in )?(19|20)\d{2}|class of (19|20)\d{2}|(mba|ba|bsc|ma|msc|phd|degree)[^.]{0,30}\b(19|20)\d{2})/i,
  },
  { attribute: 'photo', pattern: /\b(photo|headshot|picture of me|selfie)\b/i },
];

/** Attempts to steer the model or the extractor from inside an answer. */
const INJECTION =
  /\b(ignore (all |the )?(previous|prior|above|earlier) (instructions|prompts?)|disregard (the|all|your) (instructions|rules)|system prompt|you are now|act as (an?|the) |new instructions|developer mode|<\/?(system|assistant|instructions?)>|set (my|the) (headline|score|level) to)/i;

const CONTACT: RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/g, // email
  /(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, // North American style phone
  /\+\d{1,3}(?:[\s.-]?\d{2,4}){3,5}\b/g, // international phone with country code
  /\bhttps?:\/\/\S+|\bwww\.\S+|\blinkedin\.com\/\S*/gi, // URLs
];

/** Street address lines, e.g. "123 King Street West", "Flat 4, 22 Baker St". */
const ADDRESS =
  /\b\d{1,5}\s+[A-Z][\w'.-]*(\s+[A-Z][\w'.-]*){0,3}\s+(street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|court|ct|place|pl|square|sq|crescent|terrace)\b\.?/i;
const POSTCODE = /\b([A-Z]\d[A-Z]\s?\d[A-Z]\d|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}|\d{5}(-\d{4})?)\b/;

export function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface ScrubResult {
  text: string;
  /** Which protected attributes were removed (never the content itself). */
  removed: string[];
  injection: boolean;
}

/** Drop sentences that disclose protected attributes or try to inject instructions. */
export function scrubAnswer(text: string): ScrubResult {
  const removed = new Set<string>();
  let injection = false;
  const kept = splitSentences(text).filter((s) => {
    if (INJECTION.test(s)) {
      injection = true;
      return false;
    }
    const hit = PROTECTED.find((p) => p.pattern.test(s));
    if (hit) {
      removed.add(hit.attribute);
      return false;
    }
    return true;
  });
  return { text: stripContact(kept.join(' ')).trim(), removed: [...removed], injection };
}

/** Remove emails, phone numbers and URLs inline. */
export function stripContact(text: string): string {
  let out = text;
  for (const re of CONTACT) out = out.replace(re, '');
  return out.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1');
}

/**
 * For uploaded résumé text: drop whole lines that look like contact details or addresses,
 * then strip inline contact details and protected-attribute sentences.
 */
export function scrubDocument(text: string): ScrubResult {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => {
      const l = line.trim();
      // Long lines are body text (or a PDF flattened to one line): scrub them inline instead.
      if (!l || l.length > 160) return true;
      if (CONTACT.some((re) => new RegExp(re.source, re.flags.replace('g', '')).test(l)))
        return false;
      if (ADDRESS.test(l)) return false;
      if (POSTCODE.test(l) && l.length < 60 && /,/.test(l)) return false;
      return true;
    })
    // Inline fallback: street addresses and alphanumeric postcodes inside longer text.
    .map((l) =>
      l
        .replace(new RegExp(ADDRESS.source, 'gi'), '')
        .replace(/\b([A-Z]\d[A-Z]\s?\d[A-Z]\d|[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2})\b/g, ''),
    );
  return scrubAnswer(lines.join('\n'));
}

/** True when the text still contains anything the scrubbers would remove. */
export function containsProtected(text: string): boolean {
  return splitSentences(text).some((s) => PROTECTED.some((p) => p.pattern.test(s)));
}
