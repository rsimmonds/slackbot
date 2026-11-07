import { jobPostingJsonLd, serializeJsonLd } from './jsonld';
import type { JobRow } from './queries';

const base = {
  listingId: '11111111-1111-4111-8111-111111111111',
  status: 'live',
  plan: 'standard',
  featured: false,
  publishedAt: new Date('2026-11-01T00:00:00Z'),
  expiresAt: new Date('2026-12-31T00:00:00Z'),
  mandateId: '22222222-2222-4222-8222-222222222222',
  title: 'Chief Marketing Officer',
  level: 'cmo',
  scope: 'Owns brand and demand.',
  reportingLine: 'CEO',
  teamSize: 30,
  priorities: ['Reposition the brand'],
  compMin: 400000,
  compMax: 480000,
  currency: 'USD',
  compBasis: 'annual',
  workType: 'full_time',
  location: 'US',
  remote: false,
  market: 'US',
  isSample: true,
  companyId: '33333333-3333-4333-8333-333333333333',
  companyName: 'Halvard Systems',
  companyIndustry: 'Fintech',
  companyStage: 'Series C',
  companySize: '201-500',
  companyDomain: 'halvard.example',
} as unknown as JobRow;

describe('JobPosting JSON-LD', () => {
  it('describes a full-time role with an annual salary range', () => {
    const ld = jobPostingJsonLd(base, 'https://cmobeat.com');
    expect(ld).toMatchObject({
      '@type': 'JobPosting',
      employmentType: 'FULL_TIME',
      directApply: false,
      validThrough: '2026-12-31T00:00:00.000Z',
      baseSalary: {
        currency: 'USD',
        value: { minValue: 400000, maxValue: 480000, unitText: 'YEAR' },
      },
      url: `https://cmobeat.com/jobs/${base.listingId}`,
    });
    expect(ld.jobLocationType).toBeUndefined();
  });

  it('describes a remote fractional role paid monthly', () => {
    const ld = jobPostingJsonLd({
      ...base,
      workType: 'fractional',
      compBasis: 'monthly_retainer',
      currency: 'EUR',
      market: 'EU',
      remote: true,
    } as JobRow);
    expect(ld).toMatchObject({
      employmentType: ['CONTRACTOR', 'PART_TIME'],
      jobLocationType: 'TELECOMMUTE',
      baseSalary: { currency: 'EUR', value: { unitText: 'MONTH' } },
    });
  });

  it('cannot break out of its script tag', () => {
    expect(serializeJsonLd({ title: '</script><script>alert(1)</script>' })).not.toContain(
      '</script>',
    );
  });
});
