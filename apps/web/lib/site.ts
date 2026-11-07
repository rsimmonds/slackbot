import { brand } from '@cmobeat/config';

/** Public origin used in sitemaps, feeds and structured data. */
export const siteUrl = () => (process.env.SITE_URL || `https://${brand.domain}`).replace(/\/$/, '');

/** Private areas that crawlers must never index. */
export const privatePaths = [
  '/account',
  '/me',
  '/employer',
  '/console',
  '/dashboard',
  '/sign-in',
  '/api/',
];

export function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!,
  );
}
