import { XMLParser } from 'fast-xml-parser';
import { htmlToText, safeFetch } from '../net/safe-fetch';

export type SourceKind = 'newsroom' | 'wire' | 'edgar' | 'submission';

export interface RawSourceItem {
  kind: SourceKind;
  url: string;
  title: string;
  publisher: string | null;
  publishedAt: Date | null;
  text: string;
}

export interface SourceAdapter {
  name: string;
  kind: SourceKind;
  fetch(now: Date): Promise<RawSourceItem[]>;
}

export type FetchText = (url: string, headers?: Record<string, string>) => Promise<string>;

const defaultFetch: FetchText = async (url, headers) =>
  (await safeFetch(url, { headers, accept: /(xml|html|text\/plain|atom|rss)/i })).body;

/** Cheap pre-filter so only items that could be about the marketing seat reach the model. */
export const MAY_BE_A_MOVE =
  /(chief marketing|\bCMO\b|chief growth|chief brand|head of marketing|marketing officer)/i;

/** Sources we never read, whatever the configuration says (their terms forbid it). */
const FORBIDDEN_HOSTS = /(^|\.)linkedin\.com$/i;
export const isForbiddenSource = (url: string) => {
  try {
    return FORBIDDEN_HOSTS.test(new URL(url).hostname);
  } catch {
    return true;
  }
};

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  processEntities: true,
});
const asArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];
const text = (v: unknown): string =>
  typeof v === 'string'
    ? v
    : typeof v === 'number'
      ? String(v)
      : v && typeof v === 'object' && '#text' in v
        ? String((v as Record<string, unknown>)['#text'])
        : '';

function atomLink(link: unknown): string {
  for (const l of asArray(link as Record<string, string> | Record<string, string>[])) {
    if (typeof l === 'string') return l;
    if (!l['@rel'] || l['@rel'] === 'alternate') return l['@href'] ?? '';
  }
  return '';
}

/** Parses RSS 2.0 or Atom into raw items. */
export function parseFeed(
  body: string,
  kind: SourceKind,
  publisher: string | null,
): RawSourceItem[] {
  const doc = xml.parse(body) as Record<string, any>;
  const rssItems = asArray(doc.rss?.channel?.item);
  const atomEntries = asArray(doc.feed?.entry);
  const items: RawSourceItem[] = [];
  for (const it of rssItems) {
    items.push({
      kind,
      url: text(it.link).trim(),
      title: htmlToText(text(it.title)),
      publisher,
      publishedAt: it.pubDate ? new Date(text(it.pubDate)) : null,
      text: htmlToText(text(it['content:encoded']) || text(it.description)),
    });
  }
  for (const e of atomEntries) {
    items.push({
      kind,
      url: atomLink(e.link).trim(),
      title: htmlToText(text(e.title)),
      publisher,
      publishedAt: e.updated || e.published ? new Date(text(e.published) || text(e.updated)) : null,
      text: htmlToText(text(e.content) || text(e.summary)),
    });
  }
  return items
    .filter((i) => i.url && i.title && !isForbiddenSource(i.url))
    .map((i) => ({
      ...i,
      publishedAt: i.publishedAt && !Number.isNaN(i.publishedAt.getTime()) ? i.publishedAt : null,
    }));
}

/** A company newsroom or press-wire RSS/Atom feed. */
export function feedAdapter(opts: {
  name: string;
  kind: 'newsroom' | 'wire';
  url: string;
  publisher?: string;
  fetchText?: FetchText;
}): SourceAdapter {
  return {
    name: opts.name,
    kind: opts.kind,
    async fetch() {
      const body = await (opts.fetchText ?? defaultFetch)(opts.url);
      return parseFeed(body, opts.kind, opts.publisher ?? opts.name).filter((i) =>
        MAY_BE_A_MOVE.test(`${i.title} ${i.text}`),
      );
    },
  };
}

export const EDGAR_CURRENT_8K =
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&start=0&count=100&output=atom';

/** The Item 5.02 section of an 8-K, as plain text. */
export function item502Section(filingText: string): string | null {
  const start = filingText.search(/Item\s+5\.02/i);
  if (start < 0) return null;
  const rest = filingText.slice(start);
  const next = rest.slice(10).search(/\n\s*Item\s+\d+\.\d+/i);
  return (next > 0 ? rest.slice(0, next + 10) : rest).slice(0, 6000).trim();
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * SEC EDGAR 8-K filings with Item 5.02 (departure or appointment of officers).
 * The SEC requires a descriptive User-Agent with contact details and at most 10 requests a
 * second; we stay well under that. Disabled unless SEC_USER_AGENT is set.
 */
export function edgarAdapter(opts: {
  userAgent: string;
  fetchText?: FetchText;
  maxFilings?: number;
  delayMs?: number;
}): SourceAdapter {
  const get = opts.fetchText ?? defaultFetch;
  const headers = { 'user-agent': opts.userAgent, accept: 'application/atom+xml,text/html' };
  return {
    name: 'SEC EDGAR',
    kind: 'edgar',
    async fetch() {
      const feed = xml.parse(await get(EDGAR_CURRENT_8K, headers)) as Record<string, any>;
      const entries = asArray(feed.feed?.entry).filter((e) =>
        /Item\s+5\.02/i.test(text(e.summary)),
      );
      const items: RawSourceItem[] = [];
      for (const e of entries.slice(0, opts.maxFilings ?? 20)) {
        const indexUrl = atomLink(e.link);
        const company = text(e.title)
          .replace(/^8-K\s*-\s*/, '')
          .replace(/\s*\(\d{10}\).*$/, '')
          .trim();
        await pause(opts.delayMs ?? 150);
        const indexHtml = await get(indexUrl, headers);
        const doc = indexHtml.match(/href="(\/Archives\/edgar\/data\/[^"]+\.htm)"/i)?.[1];
        if (!doc) continue;
        await pause(opts.delayMs ?? 150);
        const section = item502Section(
          htmlToText(await get(new URL(doc, 'https://www.sec.gov').toString(), headers)),
        );
        if (!section || !MAY_BE_A_MOVE.test(section)) continue;
        items.push({
          kind: 'edgar',
          url: indexUrl,
          title: `${company}: Form 8-K, Item 5.02`,
          publisher: `SEC EDGAR (${company})`,
          publishedAt: e.updated ? new Date(text(e.updated)) : null,
          text: section,
        });
      }
      return items;
    },
  };
}

/**
 * Adapters from environment:
 * MOVES_NEWSROOM_FEEDS / MOVES_WIRE_FEEDS = "Publisher|https://feed,Publisher|https://feed"
 * SEC_USER_AGENT = "CMO Beat newsroom contact@your-domain" (enables EDGAR)
 */
export function adaptersFromEnv(env: NodeJS.ProcessEnv = process.env): SourceAdapter[] {
  const feeds = (v: string | undefined, kind: 'newsroom' | 'wire') =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        const [name, url] = entry.includes('|')
          ? (entry.split('|') as [string, string])
          : [new URL(entry).hostname, entry];
        return feedAdapter({ name: name.trim(), kind, url: url.trim() });
      });
  const list = [
    ...feeds(env.MOVES_NEWSROOM_FEEDS, 'newsroom'),
    ...feeds(env.MOVES_WIRE_FEEDS, 'wire'),
  ];
  if (env.SEC_USER_AGENT?.trim()) list.push(edgarAdapter({ userAgent: env.SEC_USER_AGENT.trim() }));
  return list;
}
