import { createElement } from 'react';
import { renderEmail } from './render';
import { SponsorshipBlock, sponsorshipText } from './templates/Sponsorship';

const creative = {
  sponsorName: 'Northwind Analytics (sample)',
  headline: 'Benchmark your marketing team',
  body: 'A free report for CMOs.',
  url: 'https://northwind.example/report',
};

describe('newsletter sponsorship block', () => {
  it('is labelled, links once to the sponsor, and carries no images or pixels', async () => {
    const { html, text } = await renderEmail(createElement(SponsorshipBlock, creative));
    expect(text).toMatch(/SPONSORED/i);
    expect(html).toContain('Sponsored · Northwind Analytics (sample)');
    expect(html.match(/href="https:\/\/northwind\.example\/report"/g)).toHaveLength(1);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/utm_/);
  });

  it('has a plain-text version', () => {
    expect(sponsorshipText(creative)).toBe(
      'SPONSORED · Northwind Analytics (sample)\nBenchmark your marketing team\nA free report for CMOs.\nhttps://northwind.example/report',
    );
  });
});
