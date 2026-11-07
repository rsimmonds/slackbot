import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  assertSafeUrl,
  htmlToText,
  isBlockedAddress,
  safeFetch,
  safeLookup,
} from '../src/net/safe-fetch';

describe('SSRF guard', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fc00::1',
    'fd12::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    'not-an-ip',
  ])('blocks %s', (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each(['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111'])(
    'allows public %s',
    (ip) => expect(isBlockedAddress(ip)).toBe(false),
  );

  it.each([
    'file:///etc/passwd',
    'ftp://example.com/x',
    'gopher://example.com',
    'http://user:pass@example.com/',
    'http://example.com:8080/',
    'http://localhost/',
    'http://127.0.0.1/',
    'http://[::1]/',
    'http://169.254.169.254/latest/meta-data',
    'http://metadata.google.internal/',
    'http://printer.local/',
    'javascript:alert(1)',
  ])('rejects %s', (url) => expect(() => assertSafeUrl(url)).toThrow());

  it('refuses hostnames that resolve to private addresses at connect time', async () => {
    await new Promise<void>((resolve) =>
      safeLookup('localhost', { all: true }, (err) => {
        expect(err?.message).toMatch(/not public/);
        resolve();
      }),
    );
  });
});

describe('safeFetch', () => {
  let server: http.Server;
  let port = 0;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/jd')
        return res
          .writeHead(200, { 'content-type': 'text/html' })
          .end('<h1>CMO</h1><script>x()</script><p>Base &pound;200k</p>');
      if (req.url === '/redirect-private')
        return res.writeHead(302, { location: 'http://169.254.169.254/latest' }).end();
      if (req.url === '/big')
        return res.writeHead(200, { 'content-type': 'text/plain' }).end('x'.repeat(2_000_000));
      if (req.url === '/pdf')
        return res.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF');
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  // The test server is local, so tests point a public-looking hostname at it with a lookup
  // override and a test port. Production never passes either.
  const toLocal = ((
    _h: string,
    o: { all?: boolean },
    cb: (e: null, a: unknown, f?: number) => void,
  ) =>
    o?.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4)) as never;
  const get = (path: string) =>
    safeFetch(`http://jobs.example.com${path}`, { lookup: toLocal, testPort: port }).catch(
      (e: Error) => e,
    );

  it('strips HTML to readable text', () => {
    expect(
      htmlToText(
        '<h1>CMO</h1><script>x()</script><p>Base &pound;200k</p><ul><li>One</li><li>Two</li></ul>',
      ),
    ).toBe('CMO\nBase £200k\n- One\n- Two');
  });

  it('fetches an allowed page', async () => {
    const res = await get('/jd');
    expect(res).not.toBeInstanceOf(Error);
    expect((res as { body: string }).body).toContain('<h1>CMO</h1>');
  });

  it('re-checks redirects and refuses one into a private range', async () => {
    expect(String(await get('/redirect-private'))).toMatch(/not public/);
  });

  it('caps size at 1 MB and refuses other content types', async () => {
    expect(String(await get('/big'))).toMatch(/larger than 1 MB/);
    expect(String(await get('/pdf'))).toMatch(/Unsupported content type/);
  });

  it('refuses the local server when reached directly', async () => {
    expect(await safeFetch(`http://127.0.0.1:${port}/jd`).catch((e: Error) => e)).toBeInstanceOf(
      Error,
    );
  });
});
