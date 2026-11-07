import { describeFilters } from './format';
import { parseFilters, savedQuery, toQuery } from './filters';

describe('job filters', () => {
  it('parses URL params, ignoring invalid values instead of failing the page', () => {
    const f = parseFilters({
      level: 'cmo',
      currency: 'EUR',
      minComp: '250000',
      remote: '1',
      page: '2',
      bogus: 'x',
      work: 'nope',
    });
    expect(f).toEqual({ level: 'cmo', currency: 'EUR', minComp: 250000, remote: true, page: 2 });
  });

  it('round-trips through a query string and omits page 1', () => {
    const f = parseFilters({ q: 'fintech', market: 'CA', page: '1' });
    expect(toQuery(f)).toBe('?q=fintech&market=CA');
    expect(parseFilters(new URLSearchParams(toQuery(f).slice(1)))).toEqual(f);
    expect(toQuery(f, { page: 3 })).toBe('?q=fintech&market=CA&page=3');
  });

  it('saves filters without the page', () => {
    expect(savedQuery(parseFilters({ level: 'vp_marketing', page: '4' }))).toEqual({
      level: 'vp_marketing',
    });
  });

  it('describes filters in plain English', () => {
    expect(describeFilters({})).toBe('All roles');
    expect(
      describeFilters({ level: 'fractional_cmo', remote: true, currency: 'GBP', minComp: 10000 }),
    ).toBe('Fractional CMO · Remote · GBP 10K+');
  });
});
