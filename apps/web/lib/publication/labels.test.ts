import { compLabel, formatDate, formatDuration, isoDate, readingMinutes } from './labels';

describe('publication labels', () => {
  it('always shows the currency code with comp', () => {
    expect(compLabel(380000, 450000, 'USD', 'annual')).toBe('$380K–$450K USD');
    expect(compLabel(12000, 16000, 'EUR', 'monthly_retainer')).toMatch(/12K.*16K \/ mo EUR$/);
    expect(compLabel(null, null, 'GBP', 'annual')).toBe('Comp not stated');
  });

  it('formats dates in UTC without day shifts', () => {
    expect(formatDate('2026-07-13')).toBe('13 July 2026');
    expect(formatDate('2026-07-13', 'short')).toBe('13 Jul 2026');
    expect(isoDate('2026-07-13')).toBe('2026-07-13');
  });

  it('computes reading time and durations', () => {
    expect(readingMinutes('word '.repeat(460))).toBe(2);
    expect(readingMinutes('')).toBe(1);
    expect(formatDuration(412)).toBe('6:52');
  });
});
