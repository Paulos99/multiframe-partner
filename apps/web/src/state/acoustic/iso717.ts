/**
 * Simplified ISO 717-1 (Rw) and ISO 717-2 (Lnw) from 1/3-octave bands.
 * Unfavorable-deviation sum ≤ 32 dB; 1 dB reference-curve steps.
 */
import { ISO_HZ, round0 } from './bands';

/** ISO 717-1 reference curve (dB), value at 500 Hz = 52. */
const RW_REF: Record<number, number> = {
  100: 33,
  125: 36,
  160: 39,
  200: 42,
  250: 45,
  315: 48,
  400: 51,
  500: 52,
  630: 53,
  800: 54,
  1000: 55,
  1250: 56,
  1600: 56,
  2000: 56,
  2500: 56,
  3150: 56,
};

/** ISO 717-2 reference Ln (dB), value at 500 Hz = 60. */
const LNW_REF: Record<number, number> = {
  100: 62,
  125: 62,
  160: 62,
  200: 62,
  250: 62,
  315: 62,
  400: 61,
  500: 60,
  630: 59,
  800: 58,
  1000: 57,
  1250: 54,
  1600: 51,
  2000: 48,
  2500: 45,
  3150: 42,
};

function bandLookup(hz: readonly number[], values: readonly number[], f: number): number {
  const i = hz.indexOf(f as (typeof hz)[number]);
  if (i >= 0) return values[i] ?? 0;
  return 0;
}

function rwUnfavorable(R: readonly number[], hz: readonly number[], shift: number): number {
  let sum = 0;
  for (const f of ISO_HZ) {
    const ref = (RW_REF[f] ?? 52) + shift;
    const meas = bandLookup(hz, R, f);
    const d = ref - meas;
    if (d > 0) sum += d;
  }
  return sum;
}

/** Airborne weighted index Rw (dB). */
export function iso717Rw(R: readonly number[], hz: readonly number[]): number {
  let shift = -25;
  for (let s = -25; s <= 40; s++) {
    if (rwUnfavorable(R, hz, s) <= 32) shift = s;
    else break;
  }
  return round0(52 + shift);
}

function lnwUnfavorable(Ln: readonly number[], hz: readonly number[], shift: number): number {
  let sum = 0;
  for (const f of ISO_HZ) {
    const ref = (LNW_REF[f] ?? 60) + shift;
    const meas = bandLookup(hz, Ln, f);
    const d = meas - ref;
    if (d > 0) sum += d;
  }
  return sum;
}

/** Normalized impact sound index Lnw (dB). Lower is better. */
export function iso717Lnw(Ln: readonly number[], hz: readonly number[]): number {
  // Unfavorable (Ln − ref) *falls* as the reference is shifted up, so take the
  // lowest shift where the sum is still ≤ 32 dB (max unfavorable without exceeding).
  let shift = 40;
  for (let s = -25; s <= 40; s++) {
    if (lnwUnfavorable(Ln, hz, s) <= 32) {
      shift = s;
      break;
    }
  }
  return round0(60 + shift);
}

/**
 * Shift a spectrum so ISO Rw equals `target`. Shape is preserved.
 */
export function calibrateToRw(
  R: readonly number[],
  hz: readonly number[],
  target: number,
): number[] {
  const cur = iso717Rw(R, hz);
  const d = target - cur;
  return R.map((v) => Math.round((v + d) * 10) / 10);
}

/**
 * Shift Ln spectrum so ISO Lnw equals `target`.
 */
export function calibrateToLnw(
  Ln: readonly number[],
  hz: readonly number[],
  target: number,
): number[] {
  const cur = iso717Lnw(Ln, hz);
  const d = target - cur;
  return Ln.map((v) => Math.round((v + d) * 10) / 10);
}
