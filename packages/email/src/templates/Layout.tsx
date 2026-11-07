import { brand } from '@cmobeat/config';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';

/**
 * Email clients ignore CSS variables, so the Lab (light) tokens are inlined here.
 * Keep these in step with packages/ui/src/styles/tokens.css.
 */
export const emailTokens = {
  bg: '#F4F5F6',
  surface: '#FFFFFF',
  line: '#E6E7E9',
  text: '#0B0D10',
  text2: '#5A6068',
  text3: '#6B6F74',
  synapseInk: '#0A75AF',
  filamentInk: '#A35E10',
  serif: "'Instrument Serif', Georgia, 'Times New Roman', serif",
  sans: "'Geist', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: "'Geist Mono', ui-monospace, Menlo, Consolas, monospace",
};

const label = {
  fontFamily: emailTokens.mono,
  fontSize: '11px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: emailTokens.text3,
  margin: 0,
};

export interface EmailLayoutProps {
  preview: string;
  /** Mono label above the content, e.g. "Newsletter · Confirm". */
  eyebrow?: string;
  children: ReactNode;
  /** Why the reader received this, in one sentence. */
  reason: string;
  postalAddress: string;
  siteUrl: string;
  /** Shown for bulk mail. Transactional mail may omit it. */
  unsubscribeUrl?: string;
  preferencesUrl?: string;
}

/** Shared layout for every email: wordmark, content, and a compliant footer. */
export function EmailLayout({
  preview,
  eyebrow,
  children,
  reason,
  postalAddress,
  siteUrl,
  unsubscribeUrl,
  preferencesUrl,
}: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: emailTokens.bg,
          margin: 0,
          padding: '32px 0',
          fontFamily: emailTokens.sans,
        }}
      >
        <Container
          style={{
            maxWidth: '560px',
            backgroundColor: emailTokens.surface,
            border: `1px solid ${emailTokens.line}`,
            borderRadius: '8px',
            padding: '40px',
          }}
        >
          <Text
            style={{
              fontFamily: emailTokens.serif,
              fontSize: '22px',
              color: emailTokens.text,
              margin: '0 0 32px',
            }}
          >
            {brand.name}
          </Text>
          {eyebrow ? <Text style={label}>{eyebrow}</Text> : null}
          {children}
        </Container>
        <Container style={{ maxWidth: '560px', padding: '24px 40px' }}>
          <Text
            style={{
              fontSize: '12px',
              lineHeight: '18px',
              color: emailTokens.text3,
              margin: '0 0 8px',
            }}
          >
            {reason}
          </Text>
          {unsubscribeUrl || preferencesUrl ? (
            <Text
              style={{
                fontSize: '12px',
                lineHeight: '18px',
                color: emailTokens.text3,
                margin: '0 0 8px',
              }}
            >
              {preferencesUrl ? (
                <Link href={preferencesUrl} style={{ color: emailTokens.text2 }}>
                  Email preferences
                </Link>
              ) : null}
              {preferencesUrl && unsubscribeUrl ? ' · ' : null}
              {unsubscribeUrl ? (
                <Link href={unsubscribeUrl} style={{ color: emailTokens.text2 }}>
                  Unsubscribe
                </Link>
              ) : null}
            </Text>
          ) : null}
          <Text
            style={{ fontSize: '12px', lineHeight: '18px', color: emailTokens.text3, margin: 0 }}
          >
            {brand.name} · {postalAddress} ·{' '}
            <Link href={siteUrl} style={{ color: emailTokens.text2 }}>
              {siteUrl.replace(/^https?:\/\//, '')}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function EmailHeading({ children }: { children: ReactNode }) {
  return (
    <Heading
      as="h1"
      style={{
        fontFamily: emailTokens.serif,
        fontWeight: 400,
        fontSize: '32px',
        lineHeight: '38px',
        color: emailTokens.text,
        margin: '12px 0 16px',
      }}
    >
      {children}
    </Heading>
  );
}

export function EmailText({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <Text
      style={{
        fontSize: '16px',
        lineHeight: '26px',
        color: muted ? emailTokens.text2 : emailTokens.text,
        margin: '0 0 16px',
      }}
    >
      {children}
    </Text>
  );
}

/**
 * A human decision (confirming, consenting) uses the amber filament ink; anything else uses
 * the near-black primary.
 */
export function EmailButton({
  href,
  children,
  human,
}: {
  href: string;
  children: ReactNode;
  human?: boolean;
}) {
  return (
    <Section style={{ margin: '24px 0' }}>
      <Button
        href={href}
        style={{
          backgroundColor: human ? emailTokens.filamentInk : emailTokens.text,
          color: '#FFFFFF',
          fontSize: '14px',
          fontWeight: 500,
          borderRadius: '4px',
          padding: '12px 20px',
          textDecoration: 'none',
        }}
      >
        {children}
      </Button>
    </Section>
  );
}

export function EmailRule() {
  return <Hr style={{ borderColor: emailTokens.line, margin: '24px 0' }} />;
}
