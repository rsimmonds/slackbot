import { brand } from '@cmobeat/config';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.description,
  metadataBase: new URL(`https://${brand.domain}`),
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
      </body>
    </html>
  );
}
