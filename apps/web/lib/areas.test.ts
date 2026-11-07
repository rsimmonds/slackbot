import { areaForPath, canEnter } from './areas';

describe('area access', () => {
  it('maps paths to areas', () => {
    expect(areaForPath('/console/editorial')).toBe('staff');
    expect(areaForPath('/me')).toBe('candidate');
    expect(areaForPath('/employers-guide')).toBeNull();
    expect(areaForPath('/jobs')).toBeNull();
  });

  it('keeps employers out of candidate and staff areas', () => {
    expect(canEnter('candidate', ['employer'])).toBe(false);
    expect(canEnter('staff', ['employer'])).toBe(false);
    expect(canEnter('employer', ['employer'])).toBe(true);
  });

  it('lets a user with several roles into each matching area', () => {
    expect(canEnter('candidate', ['reader', 'candidate'])).toBe(true);
    expect(canEnter('staff', ['talent_partner'])).toBe(true);
  });
});
