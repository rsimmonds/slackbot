import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';

/**
 * Fetches one public URL with SSRF protection:
 * - http/https only, default ports only, no credentials in the URL
 * - every resolved address is checked, and the check runs inside the socket's own DNS lookup, so a
 *   hostname cannot pass validation and then rebind to a private address
 * - private, loopback, link-local, CGNAT, multicast and cloud-metadata ranges are refused
 * - redirects are followed manually (max 3) and each hop is re-validated
 * - 10 second timeout, 1 MB cap, allowed content types only
 */

export class UnsafeUrlError extends Error {}

const blocked4: [number, number][] = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10/8
  [0x64400000, 10], // 100.64/10 CGNAT
  [0x7f000000, 8], // 127/8
  [0xa9fe0000, 16], // 169.254/16 link-local + metadata
  [0xac100000, 12], // 172.16/12
  [0xc0000000, 24], // 192.0.0/24
  [0xc0000200, 24], // 192.0.2/24 TEST-NET-1
  [0xc0a80000, 16], // 192.168/16
  [0xc6120000, 15], // 198.18/15 benchmarking
  [0xc6336400, 24], // 198.51.100/24 TEST-NET-2
  [0xcb007100, 24], // 203.0.113/24 TEST-NET-3
  [0xe0000000, 4], // 224/4 multicast
  [0xf0000000, 4], // 240/4 reserved + broadcast
];

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const n = ipv4ToInt(ip);
    return blocked4.some(([base, bits]) => n >>> (32 - bits) === base >>> (32 - bits));
  }
  if (family === 6) {
    const a = ip.toLowerCase();
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]!);
    if (a === '::' || a === '::1') return true;
    if (/^f[cd]/.test(a)) return true; // fc00::/7 unique local
    if (/^fe[89ab]/.test(a)) return true; // fe80::/10 link-local
    if (/^ff/.test(a)) return true; // multicast
    if (a.startsWith('64:ff9b:') || a.startsWith('2001:db8')) return true; // NAT64, documentation
    return false;
  }
  return true;
}

export function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new UnsafeUrlError('Only http and https links are allowed.');
  if (url.username || url.password)
    throw new UnsafeUrlError('Links with credentials are not allowed.');
  if (url.port && url.port !== '80' && url.port !== '443')
    throw new UnsafeUrlError('Links on non-standard ports are not allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && isBlockedAddress(host)) throw new UnsafeUrlError('That address is not public.');
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host))
    throw new UnsafeUrlError('That address is not public.');
  return url;
}

type LookupFn = typeof dnsLookup;

/** A dns.lookup that refuses non-public answers. Used by the socket itself. */
export const safeLookup = ((hostname: string, options: unknown, callback: unknown) => {
  const cb = (typeof options === 'function' ? options : callback) as (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void;
  const opts = (typeof options === 'object' && options ? options : {}) as { all?: boolean };
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) return cb(err, '');
    if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
      return cb(
        Object.assign(new UnsafeUrlError('That address is not public.'), { code: 'EUNSAFE' }),
        '',
      );
    }
    if (opts.all) return cb(null, addresses);
    cb(null, addresses[0]!.address, addresses[0]!.family);
  });
}) as LookupFn;

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  accept?: RegExp;
  /** Tests only: replace DNS. */
  lookup?: LookupFn;
  /** Tests only: connect to this port instead of 80/443 (with `lookup` pointing at a local server). */
  testPort?: number;
}

export interface SafeFetchResult {
  url: string;
  contentType: string;
  body: string;
}

export async function safeFetch(
  raw: string,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxBytes = opts.maxBytes ?? 1_000_000;
  const accept = opts.accept ?? /^(text\/html|text\/plain|application\/xhtml\+xml)/i;
  let url = assertSafeUrl(raw);

  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const res = await new Promise<{
      status: number;
      location?: string;
      contentType: string;
      body: string;
    }>((resolve, reject) => {
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request(
        url,
        {
          method: 'GET',
          ...(opts.testPort ? { port: opts.testPort } : {}),
          lookup: opts.lookup ?? safeLookup,
          headers: {
            'user-agent': 'CMOBeat-Fetcher/1.0 (+https://cmobeat.com)',
            accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
            ...opts.headers,
          },
          timeout: timeoutMs,
        },
        (r) => {
          const status = r.statusCode ?? 0;
          const contentType = String(r.headers['content-type'] ?? '');
          if (status >= 300 && status < 400 && r.headers.location) {
            r.resume();
            return resolve({ status, location: r.headers.location, contentType, body: '' });
          }
          if (status >= 400) {
            r.resume();
            return reject(new Error(`The page returned ${status}.`));
          }
          if (!accept.test(contentType)) {
            r.resume();
            return reject(
              new UnsafeUrlError(`Unsupported content type: ${contentType || 'unknown'}.`),
            );
          }
          let size = 0;
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => {
            size += c.length;
            if (size > maxBytes) {
              req.destroy(new Error('The page is larger than 1 MB.'));
              return;
            }
            chunks.push(c);
          });
          r.on('end', () =>
            resolve({ status, contentType, body: Buffer.concat(chunks).toString('utf8') }),
          );
          r.on('error', reject);
        },
      );
      req.on('timeout', () => req.destroy(new Error('The page took too long to respond.')));
      req.on('error', reject);
      req.end();
    });
    if (res.location) {
      url = assertSafeUrl(new URL(res.location, url).toString());
      continue;
    }
    return { url: url.toString(), contentType: res.contentType, body: res.body };
  }
  throw new UnsafeUrlError('Too many redirects.');
}

const entities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  euro: '€',
  pound: '£',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return entities[e.toLowerCase()] ?? m;
  });
}

/** Readable text from HTML: drops scripts, styles and markup; keeps paragraph and list breaks. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/section|\/article)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
