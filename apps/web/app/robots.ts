import type { MetadataRoute } from 'next';
import { privatePaths, siteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          ...privatePaths,
          '/newsletter/confirm',
          '/newsletter/preferences',
          '/newsletter/unsubscribe',
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
