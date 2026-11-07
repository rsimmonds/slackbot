import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkContrast, ratio } from '../lib/contrast';

describe('contrast', () => {
  it('computes known ratios', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(ratio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  it('every text and interactive token pair passes WCAG 2.2 AA in both themes', () => {
    const css = readFileSync(join(__dirname, '../styles/tokens.css'), 'utf8');
    const failures = checkContrast(css).filter((r) => !r.pass);
    expect(failures).toEqual([]);
  });
});
