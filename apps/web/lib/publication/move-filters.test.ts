import { movesHref, parseMoveFilters } from './move-filters';

describe('moves filters', () => {
  it('keeps valid filters and drops malformed ones', () => {
    const r = parseMoveFilters({
      q: '  Corvid ',
      type: 'departed',
      market: 'MARS',
      company: 'not-a-uuid',
      from: '2026-07-01',
      to: '07/01/2026',
      page: '2',
    });
    expect(r).toEqual({ filters: { q: 'Corvid', type: 'departed', from: '2026-07-01' }, page: 2 });
  });

  it('treats empty strings and arrays sensibly', () => {
    expect(parseMoveFilters({ q: '', industry: ['Fintech', 'Retail'] })).toEqual({
      filters: { industry: 'Fintech' },
      page: 1,
    });
  });

  it('round-trips into a URL', () => {
    expect(movesHref({ type: 'appointed', market: 'EU' }, 3)).toBe(
      '/moves?type=appointed&market=EU&page=3',
    );
    expect(movesHref({})).toBe('/moves');
  });
});
