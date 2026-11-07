import { Link, Section, Text } from '@react-email/components';
import { emailTokens } from './Layout';

export interface SponsorshipCreative {
  sponsorName: string;
  headline: string;
  body?: string;
  url: string;
}

/**
 * Sponsorship block for newsletter issues. Clearly labelled, one plain link, no images and no
 * tracking pixels. We never append tracking parameters to the sponsor's link.
 */
export function SponsorshipBlock({ sponsorName, headline, body, url }: SponsorshipCreative) {
  return (
    <Section
      style={{
        border: `1px solid ${emailTokens.line}`,
        borderRadius: '8px',
        padding: '20px 24px',
        margin: '32px 0',
      }}
    >
      <Text
        style={{
          fontFamily: emailTokens.mono,
          fontSize: '11px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: emailTokens.text3,
          margin: '0 0 12px',
        }}
      >
        {`Sponsored · ${sponsorName}`}
      </Text>
      <Link
        href={url}
        style={{
          fontFamily: emailTokens.sans,
          fontSize: '17px',
          color: emailTokens.text,
          textDecoration: 'underline',
        }}
      >
        {headline}
      </Link>
      {body ? (
        <Text
          style={{
            fontFamily: emailTokens.sans,
            fontSize: '14px',
            lineHeight: '22px',
            color: emailTokens.text2,
            margin: '8px 0 0',
          }}
        >
          {body}
        </Text>
      ) : null}
    </Section>
  );
}

/** Plain-text version for the text/plain part of the issue. */
export function sponsorshipText({ sponsorName, headline, body, url }: SponsorshipCreative) {
  return [`SPONSORED · ${sponsorName}`, headline, body, url].filter(Boolean).join('\n');
}
