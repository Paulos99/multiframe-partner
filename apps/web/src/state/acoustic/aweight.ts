/**
 * IEC 61672 A-weighting and band energy sums (1/3-octave).
 */
import { SPECTRUM_HZ, round1 } from './bands';

/** A-weighting in dB at frequency f (Hz). */
export function aWeightDb(f: number): number {
  const f2 = f * f;
  const n = 12194 ** 2 * f2 * f2;
  const d =
    (f2 + 20.6 ** 2) *
    Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) *
    (f2 + 12194 ** 2);
  return 20 * Math.log10(n / d) + 2;
}

/** Energy-sum of 1/3-octave band levels (unweighted). */
export function energySumDb(levels: readonly number[]): number {
  let e = 0;
  for (const L of levels) e += 10 ** (L / 10);
  return round1(10 * Math.log10(Math.max(1e-18, e)));
}

/** A-weighted equivalent level from 1/3-octave bands. */
export function aWeightedSumDb(levels: readonly number[]): number {
  let e = 0;
  for (let i = 0; i < SPECTRUM_HZ.length; i++) {
    const L = (levels[i] ?? 0) + aWeightDb(SPECTRUM_HZ[i]!);
    e += 10 ** (L / 10);
  }
  return round1(10 * Math.log10(Math.max(1e-18, e)));
}
