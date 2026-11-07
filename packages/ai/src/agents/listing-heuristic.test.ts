import { heuristicParseListing } from './listing-heuristic';

describe('heuristic listing parser', () => {
  it('extracts comp, currency, reporting line and priorities', () => {
    const r = heuristicParseListing(`Chief Marketing Officer
Reports to the CEO. Team of 24.
Base $380,000 - $450,000
- Reposition the brand for mid-market
- Build a demand engine`);
    expect(r).toMatchObject({
      level: 'cmo',
      compMin: 380000,
      compMax: 450000,
      currency: 'USD',
      reportingLine: 'CEO',
      teamSize: 24,
      workType: 'full_time',
    });
    expect(r.priorities).toHaveLength(2);
    expect(r.gaps).toEqual([]);
  });

  it('detects fractional roles priced as a monthly retainer in euros', () => {
    const r = heuristicParseListing(
      'Fractional CMO, 2 days a week\nRetainer €12k – €16k per month',
    );
    expect(r).toMatchObject({
      level: 'fractional_cmo',
      compBasis: 'monthly_retainer',
      compMin: 12000,
      compMax: 16000,
      currency: 'EUR',
      market: 'EU',
    });
  });

  it('flags a missing comp range', () => {
    expect(heuristicParseListing('VP Marketing\nGreat culture.').gaps[0]).toMatch(/compensation/i);
  });
});
