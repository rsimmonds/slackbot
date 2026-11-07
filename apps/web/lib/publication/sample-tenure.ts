/**
 * ILLUSTRATIVE SAMPLE, NOT MEASURED. The Moves archive does not yet hold both ends of any seat
 * (an appointment and the same person's departure), so tenure cannot be computed from data.
 * This fixed, fictional distribution stands in until it can (planned with the Phase 4 data
 * work). Every place it appears is labelled as illustrative.
 */
export const sampleTenure = {
  label: 'Illustrative sample index of 400 fictional CMO seats',
  /** Completed tenures, in half-year bins: [lower bound in years, count]. */
  bins: [
    [0, 18],
    [0.5, 34],
    [1, 52],
    [1.5, 58],
    [2, 49],
    [2.5, 41],
    [3, 35],
    [3.5, 29],
    [4, 24],
    [4.5, 19],
    [5, 15],
    [5.5, 11],
    [6, 8],
    [6.5, 7],
  ] as const satisfies readonly (readonly [number, number])[],
  binWidth: 0.5,
} as const;

/** Median of a binned distribution by linear interpolation within the median bin. */
export function medianFromBins(
  bins: readonly (readonly [number, number])[],
  width: number,
): number {
  const total = bins.reduce((s, [, n]) => s + n, 0);
  const half = total / 2;
  let seen = 0;
  for (const [lower, n] of bins) {
    if (seen + n >= half) return lower + ((half - seen) / n) * width;
    seen += n;
  }
  return bins.at(-1)![0] + width;
}

/** Median tenure of the sample, rounded to one decimal place. */
export const sampleMedianTenure =
  Math.round(medianFromBins(sampleTenure.bins, sampleTenure.binWidth) * 10) / 10;
