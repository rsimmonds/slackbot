import { niceTicks } from './chart-math';
import { medianFromBins, sampleMedianTenure, sampleTenure } from './sample-tenure';

describe('chart math', () => {
  it('produces clean ticks that cover the maximum', () => {
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(521000)).toEqual([0, 200000, 400000, 600000]);
    expect(niceTicks(25000)).toEqual([0, 10000, 20000, 30000]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });

  it('computes the binned median', () => {
    expect(
      medianFromBins(
        [
          [0, 1],
          [1, 1],
        ],
        1,
      ),
    ).toBe(1);
    expect(sampleTenure.bins.reduce((s, [, n]) => s + n, 0)).toBe(400);
    expect(sampleMedianTenure).toBe(2.4);
  });
});
