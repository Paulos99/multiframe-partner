/** 1/3-octave bands used for R(f) / impact isolation charts (zamer_graph grid). */
export const SPECTRUM_HZ = [
  100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500,
  3150, 4000, 5000,
] as const;

export type BandHz = (typeof SPECTRUM_HZ)[number];

/** ISO 717-1 / 717-2 rating bands (100–3150 Hz). */
export const ISO_HZ = SPECTRUM_HZ.filter((hz) => hz <= 3150);

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function round0(v: number): number {
  return Math.round(v);
}

export function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
}

export function addBands(a: readonly number[], b: readonly number[]): number[] {
  return a.map((v, i) => round1(v + (b[i] ?? 0)));
}

export function shiftBands(values: readonly number[], d: number): number[] {
  return values.map((v) => round1(v + d));
}

export function atHz(fn: (hz: number) => number): number[] {
  return SPECTRUM_HZ.map((h) => round1(fn(h)));
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
