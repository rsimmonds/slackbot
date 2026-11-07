import { brand } from '@cmobeat/config';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AnalyticsGate, AnalyticsLoader } from '@/components/legal/AnalyticsGate';
import './globals.css';

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.description,
  metadataBase: new URL(process.env.SITE_URL || `https://${brand.domain}`),
  alternates: { types: { 'application/rss+xml': [{ url: '/feed.xml', title: brand.name }] } },
  openGraph: { siteName: brand.name, locale: 'en_US', type: 'website' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F5F6' },
    { media: '(prefers-color-scheme: dark)', color: '#0A0B0D' },
  ],
};

async function Providers({ children }: { children: ReactNode }) {
  if (process.env.AUTH_MODE === 'clerk') {
    const { ClerkProvider } = await import('@clerk/nextjs');
    return <ClerkProvider>{children}</ClerkProvider>;
  }
  return children;
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
        <AnalyticsGate>
          <AnalyticsLoader />
        </AnalyticsGate>
      </body>
    </html>
  );
}
