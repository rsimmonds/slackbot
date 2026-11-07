import { brand, type Market } from '@cmobeat/config';
import { levelLabel } from './format';
import type { JobRow } from './queries';

const countryFor: Record<Market, string | null> = { US: 'US', CA: 'CA', UK: 'GB', EU: null };

/**
 * schema.org JobPosting (Google for Jobs). Comp is always present: baseSalary with currency and
 * YEAR or MONTH. Applications happen through the platform's consent flow, so directApply is false.
 */
export function jobPostingJsonLd(job: JobRow, origin = `https://${brand.domain}`) {
  const country = countryFor[job.market];
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: [
      job.scope,
      job.priorities.length ? `Priorities: ${job.priorities.join('; ')}.` : null,
      job.reportingLine ? `Reports to ${job.reportingLine}.` : null,
      job.teamSize ? `Team of ${job.teamSize}.` : null,
    ]
      .filter(Boolean)
      .join(' '),
    identifier: { '@type': 'PropertyValue', name: brand.name, value: job.listingId },
    datePosted: job.publishedAt?.toISOString(),
    validThrough: job.expiresAt?.toISOString(),
    employmentType: job.workType === 'fractional' ? ['CONTRACTOR', 'PART_TIME'] : 'FULL_TIME',
    occupationalCategory: levelLabel[job.level],
    hiringOrganization: {
      '@type': 'Organization',
      name: job.companyName,
      ...(job.companyDomain ? { sameAs: `https://${job.companyDomain}` } : {}),
    },
    directApply: false,
    url: `${origin}/jobs/${job.listingId}`,
  };
  if (job.compMin !== null && job.compMax !== null) {
    ld.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: job.currency,
      value: {
        '@type': 'QuantitativeValue',
        minValue: job.compMin,
        maxValue: job.compMax,
        unitText: job.compBasis === 'monthly_retainer' ? 'MONTH' : 'YEAR',
      },
    };
  }
  if (job.remote) {
    ld.jobLocationType = 'TELECOMMUTE';
    ld.applicantLocationRequirements = country
      ? { '@type': 'Country', name: country }
      : { '@type': 'AdministrativeArea', name: 'European Union' };
  } else {
    ld.jobLocation = {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressCountry: country ?? job.location ?? undefined,
        addressRegion: job.location ?? undefined,
      },
    };
  }
  return ld;
}

/** Safe to inline in a <script type="application/ld+json">: escapes "<" so content cannot close the tag. */
export const serializeJsonLd = (ld: unknown) => JSON.stringify(ld).replace(/</g, '\\u003c');
